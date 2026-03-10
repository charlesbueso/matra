// ============================================================
// Matra — Export Memory Book Edge Function
// ============================================================
// Generates a branded PDF memory book with family data.
// Premium-only, rate-limited to once per week, requires new data.
// Returns the PDF as base64 for client-side download.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { encode as base64Encode } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { checkFeatureAccess } from '../_shared/feature-gate.ts';
import { getPresignedUrl } from '../_shared/spaces.ts';
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'https://esm.sh/pdf-lib@1.17.1';

// ── Brand Constants ──
const BRAND = {
  green: rgb(22 / 255, 67 / 255, 28 / 255),       // #16431c
  cream: rgb(247 / 255, 242 / 255, 234 / 255),     // #f7f2ea
  gold: rgb(196 / 255, 154 / 255, 60 / 255),       // #C49A3C
  darkText: rgb(59 / 255, 46 / 255, 30 / 255),     // #3B2E1E
  mutedText: rgb(107 / 255, 93 / 255, 79 / 255),   // #6B5D4F
  lightLine: rgb(228 / 255, 221 / 255, 210 / 255),
  white: rgb(1, 1, 1),
  pageWidth: PageSizes.A4[0],   // 595.28
  pageHeight: PageSizes.A4[1],  // 841.89
  margin: 50,
};

const BANNER_KEY = 'matra/assets/new-lakeboat-nobg.png';
const LOGOTYPE_KEY = 'matra/assets/logo-new-nobg.png';
const MATRA_LOGOTYPE_KEY = 'matra/assets/matra-gold-logotype.png';

const COOLDOWN_DAYS = 7;

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);

    // 1. Check premium access
    const access = await checkFeatureAccess(userId, 'memoryBookExport');
    if (!access.allowed) {
      return errorResponse(access.reason!, 'FEATURE_LOCKED', 403);
    }

    const supabase = getServiceClient();

    // 2. Get user's family group
    const { data: memberships } = await supabase
      .from('family_group_members')
      .select('family_group_id')
      .eq('user_id', userId);

    const groupIds = (memberships || []).map((m: any) => m.family_group_id);
    if (groupIds.length === 0) {
      return errorResponse('No family group found. Record a conversation first.', 'NO_DATA', 400);
    }

    const familyGroupId = groupIds[0];

    // 3. Rate limit: check last completed export
    // Bypass rate limit for dev/test user Carlos
    const UNLIMITED_USERS = ['17533152-4e38-46a6-b46f-4095629bc683'];
    const { data: lastExport } = await supabase
      .from('exports')
      .select('completed_at')
      .eq('requested_by', userId)
      .eq('export_type', 'memory_book')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    if (lastExport?.completed_at && !UNLIMITED_USERS.includes(userId)) {
      const lastDate = new Date(lastExport.completed_at);
      const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < COOLDOWN_DAYS) {
        const nextDate = new Date(lastDate.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
        return errorResponse(
          `You can generate a new memory book on ${nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Memory books can be generated once per week.`,
          'RATE_LIMITED',
          429
        );
      }

      // 4. Check for new data since last export
      const since = lastExport.completed_at;
      const [newPeople, newStories, newRelationships, newInterviews] = await Promise.all([
        supabase.from('people')
          .select('id', { count: 'exact', head: true })
          .eq('family_group_id', familyGroupId)
          .gt('updated_at', since)
          .is('deleted_at', null),
        supabase.from('stories')
          .select('id', { count: 'exact', head: true })
          .eq('family_group_id', familyGroupId)
          .gt('created_at', since)
          .is('deleted_at', null),
        supabase.from('relationships')
          .select('id', { count: 'exact', head: true })
          .eq('family_group_id', familyGroupId)
          .gt('created_at', since),
        supabase.from('interviews')
          .select('id', { count: 'exact', head: true })
          .eq('family_group_id', familyGroupId)
          .gt('created_at', since)
          .is('deleted_at', null),
      ]);

      const totalNew = (newPeople.count || 0) + (newStories.count || 0) +
        (newRelationships.count || 0) + (newInterviews.count || 0);

      if (totalNew === 0) {
        return errorResponse(
          'No new data since your last memory book. Record a conversation, add a relationship, or generate a biography to create a new edition.',
          'NO_NEW_DATA',
          400
        );
      }
    }

    // 5. Fetch all family data
    const [familyGroupRes, peopleRes, relationshipsRes, storiesRes, interviewsRes, profileRes] = await Promise.all([
      supabase.from('family_groups').select('*').eq('id', familyGroupId).single(),
      supabase.from('people').select('*').eq('family_group_id', familyGroupId).is('deleted_at', null).order('created_at', { ascending: true }),
      supabase.from('relationships').select('*').eq('family_group_id', familyGroupId),
      supabase.from('stories').select('*').eq('family_group_id', familyGroupId).is('deleted_at', null).order('created_at', { ascending: true }),
      supabase.from('interviews').select('id, title, ai_summary, ai_key_topics, subject_person_id, created_at').eq('family_group_id', familyGroupId).is('deleted_at', null).eq('status', 'completed').order('created_at', { ascending: true }),
      supabase.from('profiles').select('display_name, preferences, self_person_id').eq('id', userId).single(),
    ]);

    const familyGroup = familyGroupRes.data;
    const people = peopleRes.data || [];
    const relationships = relationshipsRes.data || [];
    const stories = storiesRes.data || [];
    const interviews = interviewsRes.data || [];
    const profile = profileRes.data;

    if (people.length === 0 && stories.length === 0) {
      return errorResponse('Not enough data for a memory book. Record some conversations first.', 'NO_DATA', 400);
    }

    // 6. Fetch story-people associations
    const storyIds = stories.map((s: any) => s.id);
    let storyPeople: any[] = [];
    if (storyIds.length > 0) {
      const { data } = await supabase
        .from('story_people')
        .select('story_id, person_id, role')
        .in('story_id', storyIds);
      storyPeople = data || [];
    }

    // 7. Generate the PDF
    const userLang = profile?.preferences?.language || 'en';
    const pdfBytes = await generateMemoryBookPDF({
      familyGroup,
      people,
      relationships,
      stories,
      interviews,
      storyPeople,
      profileName: profile?.display_name || t('yourFamily', userLang),
      selfPersonId: profile?.self_person_id || undefined,
      language: userLang,
    });

    // 8. Record the export
    await supabase.from('exports').insert({
      family_group_id: familyGroupId,
      requested_by: userId,
      export_type: 'memory_book',
      status: 'completed',
      output_size_bytes: pdfBytes.length,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      config: { version: 1, peopleCount: people.length, storiesCount: stories.length },
    });

    // 9. Return as base64
    const base64 = base64Encode(pdfBytes);
    const familySlug = (familyGroup?.name || 'Family')
      .replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '-');

    return jsonResponse({
      pdf: base64,
      filename: `${familySlug}-Memory-Book.pdf`,
      size: pdfBytes.length,
    });
  } catch (err: any) {
    console.error('Export error:', err);
    return errorResponse(
      err.message || 'Internal server error',
      'INTERNAL_ERROR',
      err.message === 'Unauthorized' ? 401 : 500
    );
  }
});

// ── PDF i18n ──
const PDF_STRINGS: Record<string, Record<string, string>> = {
  en: {
    memoryBook: 'Memory Book',
    tableOfContents: 'Table of Contents',
    ourFamily: 'Our Family',
    familyMembers: 'Family Members',
    storiesAndMemories: 'Stories & Memories',
    conversations: 'Conversations',
    familyConnections: 'Family Connections',
    people: 'People',
    stories: 'Stories',
    connections: 'Connections',
    born: 'Born',
    livesIn: 'Lives in',
    unknown: 'Unknown',
    untitledStory: 'Untitled Story',
    untitledConversation: 'Untitled Conversation',
    featuring: 'Featuring:',
    aiCrafted: '* AI-crafted narrative',
    tagline: 'Every family has a story worth preserving.',
    generatedOn: 'Generated on',
    familySuffix: "'s Family",
    yourFamily: 'Your Family',
  },
  es: {
    memoryBook: 'Libro de Recuerdos',
    tableOfContents: 'Tabla de Contenidos',
    ourFamily: 'Nuestra Familia',
    familyMembers: 'Miembros de la Familia',
    storiesAndMemories: 'Historias y Recuerdos',
    conversations: 'Conversaciones',
    familyConnections: 'Conexiones Familiares',
    people: 'Personas',
    stories: 'Historias',
    connections: 'Conexiones',
    born: 'Nacido/a',
    livesIn: 'Vive en',
    unknown: 'Desconocido',
    untitledStory: 'Historia sin titulo',
    untitledConversation: 'Conversacion sin titulo',
    featuring: 'Participantes:',
    aiCrafted: '* Narrativa generada por IA',
    tagline: 'Cada familia tiene una historia que vale la pena preservar.',
    generatedOn: 'Generado el',
    familySuffix: '',
    yourFamily: 'Tu Familia',
  },
};

function t(key: string, lang: string): string {
  return PDF_STRINGS[lang]?.[key] || PDF_STRINGS.en[key] || key;
}

const REL_LABELS_I18N: Record<string, Record<string, string>> = {
  en: {
    parent: 'Parent', child: 'Child', spouse: 'Spouse', ex_spouse: 'Ex-Spouse',
    sibling: 'Sibling', grandparent: 'Grandparent', grandchild: 'Grandchild',
    great_grandparent: 'Great Grandparent', great_grandchild: 'Great Grandchild',
    uncle_aunt: 'Uncle/Aunt', nephew_niece: 'Nephew/Niece', cousin: 'Cousin',
    in_law: 'In-law', step_parent: 'Step Parent', step_child: 'Step Child',
    step_sibling: 'Step Sibling', godparent: 'Godparent', godchild: 'Godchild',
    adopted_parent: 'Adopted Parent', adopted_child: 'Adopted Child', other: 'Other',
  },
  es: {
    parent: 'Padre/Madre', child: 'Hijo/a', spouse: 'Conyuge', ex_spouse: 'Ex-Conyuge',
    sibling: 'Hermano/a', grandparent: 'Abuelo/a', grandchild: 'Nieto/a',
    great_grandparent: 'Bisabuelo/a', great_grandchild: 'Bisnieto/a',
    uncle_aunt: 'Tio/a', nephew_niece: 'Sobrino/a', cousin: 'Primo/a',
    in_law: 'Politico/a', step_parent: 'Padrastro/Madrastra', step_child: 'Hijastro/a',
    step_sibling: 'Hermanastro/a', godparent: 'Padrino/Madrina', godchild: 'Ahijado/a',
    adopted_parent: 'Padre/Madre Adoptivo/a', adopted_child: 'Hijo/a Adoptivo/a', other: 'Otro',
  },
};

function getRelLabel(type: string, lang: string): string {
  return REL_LABELS_I18N[lang]?.[type] || REL_LABELS_I18N.en[type] || type;
}

// ── PDF Generation Types ──
interface MemoryBookData {
  familyGroup: any;
  people: any[];
  relationships: any[];
  stories: any[];
  interviews: any[];
  storyPeople: any[];
  profileName: string;
  selfPersonId?: string;
  language: string;
}

interface PageContext {
  pdf: any;
  page: any;
  y: number;
  pageNum: number;
  fonts: { regular: any; bold: any; italic: any; boldItalic: any; sans: any; sansBold: any };
  bannerImage: any;
  logotypeImage: any;
}

// ── PDF Generation ──
async function generateMemoryBookPDF(data: MemoryBookData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  // Embed fonts (parallel)
  const [regular, bold, italic, boldItalic, sans, sansBold] = await Promise.all([
    pdf.embedFont(StandardFonts.TimesRoman),
    pdf.embedFont(StandardFonts.TimesRomanBold),
    pdf.embedFont(StandardFonts.TimesRomanItalic),
    pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const fonts = { regular, bold, italic, boldItalic, sans, sansBold };

  const MAX_IMAGE_BYTES = 500_000;
  let bannerImage: any = null;
  let logotypeImage: any = null;
  let matraLogotype: any = null;
  try {
    const [bannerUrl, logotypeUrl, matraLogoUrl] = await Promise.all([
      getPresignedUrl(BANNER_KEY),
      getPresignedUrl(LOGOTYPE_KEY),
      getPresignedUrl(MATRA_LOGOTYPE_KEY),
    ]);
    const [bannerResp, logotypeResp, matraLogoResp] = await Promise.all([
      fetch(bannerUrl),
      fetch(logotypeUrl),
      fetch(matraLogoUrl),
    ]);
    const [bannerBytes, logotypeBytes, matraLogoBytes] = await Promise.all([
      bannerResp.ok ? bannerResp.arrayBuffer() : null,
      logotypeResp.ok ? logotypeResp.arrayBuffer() : null,
      matraLogoResp.ok ? matraLogoResp.arrayBuffer() : null,
    ]);
    if (bannerBytes && bannerBytes.byteLength <= MAX_IMAGE_BYTES) {
      bannerImage = await pdf.embedPng(new Uint8Array(bannerBytes));
    }
    if (logotypeBytes && logotypeBytes.byteLength <= MAX_IMAGE_BYTES) {
      logotypeImage = await pdf.embedPng(new Uint8Array(logotypeBytes));
    }
    if (matraLogoBytes && matraLogoBytes.byteLength <= MAX_IMAGE_BYTES) {
      matraLogotype = await pdf.embedPng(new Uint8Array(matraLogoBytes));
    }
  } catch (e) { console.warn('Image embed skipped:', e); }

  const { pageWidth, pageHeight, margin } = BRAND;
  const contentWidth = pageWidth - margin * 2;
  const borderInset = 30;

  // ── Pre-fetch person avatars ──
  const AVATAR_MAX_BYTES = 500_000;
  const avatarImages: Record<string, any> = {};
  const avatarPeople = data.people.filter((p: any) => p.avatar_url);
  if (avatarPeople.length > 0) {
    const avatarEntries = await Promise.all(
      avatarPeople.map(async (p: any) => {
        try {
          const url = await getPresignedUrl(p.avatar_url);
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const buf = await resp.arrayBuffer();
          if (buf.byteLength > AVATAR_MAX_BYTES) return null;
          const bytes = new Uint8Array(buf);
          const img = p.avatar_url.endsWith('.png')
            ? await pdf.embedPng(bytes)
            : await pdf.embedJpg(bytes);
          return [p.id, img] as const;
        } catch { return null; }
      })
    );
    for (const entry of avatarEntries) {
      if (entry) avatarImages[entry[0]] = entry[1];
    }
  }

  // Strip characters that WinAnsi (standard PDF fonts) cannot encode
  function sanitize(text: string): string {
    return text
      .replace(/[\u2018\u2019]/g, "'")   // smart single quotes
      .replace(/[\u201C\u201D]/g, '"')   // smart double quotes
      .replace(/\u2026/g, '...')          // ellipsis
      .replace(/[\u2013\u2014]/g, '-')   // en/em dash
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
  }

  // ── Helpers ──
  function newPage(): any {
    const p = pdf.addPage([pageWidth, pageHeight]);
    p.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: BRAND.cream });
    return p;
  }

  function drawFooter(p: any, num: number) {
    p.drawLine({
      start: { x: margin, y: margin - 15 }, end: { x: pageWidth - margin, y: margin - 15 },
      thickness: 0.5, color: BRAND.gold,
    });
    const t = `${num}`;
    p.drawText(t, {
      x: (pageWidth - fonts.sans.widthOfTextAtSize(t, 8)) / 2,
      y: margin - 28, size: 8, font: fonts.sans, color: BRAND.mutedText,
    });
  }

  function drawDivider(p: any, atY: number): number {
    const centerX = pageWidth / 2;
    const armLen = 70;
    const dotGap = 6;
    // Left arm
    p.drawLine({
      start: { x: centerX - armLen - dotGap, y: atY },
      end: { x: centerX - dotGap, y: atY },
      thickness: 0.5, color: BRAND.gold,
    });
    // Center ornament (three small dots)
    for (const dx of [-3, 0, 3]) {
      p.drawCircle({
        x: centerX + dx * 2, y: atY,
        size: 1.2, color: BRAND.gold,
      });
    }
    // Right arm
    p.drawLine({
      start: { x: centerX + dotGap, y: atY },
      end: { x: centerX + armLen + dotGap, y: atY },
      thickness: 0.5, color: BRAND.gold,
    });
    return atY - 28;
  }

  function drawSectionHeader(p: any, title: string, atY: number): number {
    p.drawText(title, { x: margin, y: atY - 6, size: 26, font: fonts.bold, color: BRAND.green });
    p.drawLine({
      start: { x: margin, y: atY - 14 }, end: { x: pageWidth - margin, y: atY - 14 },
      thickness: 0.5, color: BRAND.gold,
    });
    return atY - 40;
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return sanitize(dateStr);
    if (lang === 'es') {
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return `${d.getDate()} de ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const day = d.getDate();
    const suffix = (day === 1 || day === 21 || day === 31) ? 'st' : (day === 2 || day === 22) ? 'nd' : (day === 3 || day === 23) ? 'rd' : 'th';
    return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
  }

  // Wraps text across lines, adding new pages when needed. Returns { page, y }.
  // onPageBreak is called before creating each new overflow page, with the old page
  // so callers can add footers/page numbers before the page break.
  function drawWrappedText(
    ctx: { page: any; y: number },
    text: string, x: number, font: any, size: number, color: any,
    maxWidth: number, lineHeight?: number,
    onPageBreak?: (oldPage: any) => void
  ): { page: any; y: number } {
    const lh = lineHeight || size * 1.5;
    const words = sanitize(text).split(' ');
    let line = '';
    let { page: pg, y: curY } = ctx;

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        pg.drawText(line, { x, y: curY, size, font, color });
        line = word;
        curY -= lh;
        if (curY < margin + 30) {
          if (onPageBreak) onPageBreak(pg);
          pg = newPage();
          curY = pageHeight - margin;
        }
      } else {
        line = test;
      }
    }
    if (line) {
      pg.drawText(line, { x, y: curY, size, font, color });
      curY -= lh;
    }
    return { page: pg, y: curY };
  }

  let pageNum = 0;
  const lang = data.language;
  const today = new Date();
  const dateText = formatDate(today.toISOString().split('T')[0]);
  const familyName = data.familyGroup?.name ||
    (lang === 'es' ? `Familia de ${data.profileName}` : `${data.profileName}'s Family`);

  // ═══════════════════════════════════════════
  // COVER PAGE
  // ═══════════════════════════════════════════
  const cover = pdf.addPage([pageWidth, pageHeight]);
  cover.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: BRAND.cream });
  // Outer gold border
  cover.drawRectangle({
    x: borderInset, y: borderInset,
    width: pageWidth - borderInset * 2, height: pageHeight - borderInset * 2,
    borderColor: BRAND.gold, borderWidth: 2,
  });
  // Inner gold border (double-frame effect)
  cover.drawRectangle({
    x: borderInset + 6, y: borderInset + 6,
    width: pageWidth - borderInset * 2 - 12, height: pageHeight - borderInset * 2 - 12,
    borderColor: BRAND.gold, borderWidth: 0.5,
  });
  // Corner ornaments (small gold squares at each corner)
  const co = 4;
  for (const cx of [borderInset - co / 2, pageWidth - borderInset - co / 2]) {
    for (const cy of [borderInset - co / 2, pageHeight - borderInset - co / 2]) {
      cover.drawRectangle({ x: cx, y: cy, width: co, height: co, color: BRAND.gold });
    }
  }

  // ── Cover layout: vertically center all content within border ──
  const usableTop = pageHeight - borderInset - 15;
  const usableBottom = borderInset + 15;
  const usableH = usableTop - usableBottom;
  const centerY = usableBottom + usableH / 2;

  // Logotype above family name
  if (logotypeImage) {
    const ltDim = logotypeImage.scale(0.25);
    const ltW = Math.min(ltDim.width, 200);
    const ltH = ltW * (ltDim.height / ltDim.width);
    cover.drawImage(logotypeImage, {
      x: (pageWidth - ltW) / 2, y: centerY + 100, width: ltW, height: ltH,
    });
  }

  const safeFamilyName = sanitize(familyName);
  const titleSize = safeFamilyName.length > 25 ? 26 : 32;
  const titleW = fonts.bold.widthOfTextAtSize(safeFamilyName, titleSize);
  cover.drawText(safeFamilyName, {
    x: (pageWidth - titleW) / 2, y: centerY + 50,
    size: titleSize, font: fonts.bold, color: BRAND.darkText,
  });

  // "Memory Book by [Matra logotype]" — single line
  const byPrefix = lang === 'es' ? ' por ' : ' by ';
  const subtitleText = t('memoryBook', lang) + byPrefix;
  const subFontSize = 18;
  const subTextW = fonts.italic.widthOfTextAtSize(subtitleText, subFontSize);
  const matraLogoH = 40;
  const matraLogoW = matraLogotype
    ? (matraLogotype.width / matraLogotype.height) * matraLogoH
    : 0;
  const subtitleTotalW = subTextW + matraLogoW;
  const subX = (pageWidth - subtitleTotalW) / 2;
  const subY = centerY + 15;
  cover.drawText(subtitleText, {
    x: subX, y: subY, size: subFontSize, font: fonts.italic, color: BRAND.gold,
  });
  if (matraLogotype) {
    cover.drawImage(matraLogotype, {
      x: subX + subTextW, y: subY - 12, width: matraLogoW, height: matraLogoH,
    });
  }

  cover.drawLine({
    start: { x: pageWidth / 2 - 80, y: centerY - 5 },
    end: { x: pageWidth / 2 - 10, y: centerY - 5 },
    thickness: 0.8, color: BRAND.gold,
  });
  // Center diamond ornament
  cover.drawRectangle({
    x: pageWidth / 2 - 3, y: centerY - 8,
    width: 6, height: 6,
    color: BRAND.gold,
  });
  cover.drawLine({
    start: { x: pageWidth / 2 + 10, y: centerY - 5 },
    end: { x: pageWidth / 2 + 80, y: centerY - 5 },
    thickness: 0.8, color: BRAND.gold,
  });

  const statsText = `${data.people.length} ${t('people', lang)} · ${data.stories.length} ${t('stories', lang)} · ${data.relationships.length} ${t('connections', lang)}`;
  cover.drawText(statsText, {
    x: (pageWidth - fonts.sans.widthOfTextAtSize(statsText, 10)) / 2,
    y: centerY - 25, size: 10, font: fonts.sans, color: BRAND.gold,
  });

  cover.drawText(dateText, {
    x: (pageWidth - fonts.sans.widthOfTextAtSize(dateText, 9)) / 2,
    y: usableBottom + 10, size: 9, font: fonts.sans, color: BRAND.gold,
  });

  // Banner between stats and date on cover
  if (bannerImage) {
    const bannerMargin = 25;
    const bannerW = pageWidth - borderInset * 2 - bannerMargin * 2;
    const bannerNatW = bannerImage.width;
    const bannerNatH = bannerImage.height;
    const bannerH = bannerW * (bannerNatH / bannerNatW);
    const availTop = centerY - 40;
    const availBottom = usableBottom + 25;
    const bannerY = availBottom + (availTop - availBottom - bannerH) / 2;
    cover.drawImage(bannerImage, {
      x: borderInset + bannerMargin, y: Math.max(bannerY, availBottom), width: bannerW, height: Math.min(bannerH, availTop - availBottom),
    });
  }

  // ═══════════════════════════════════════════
  // TABLE OF CONTENTS
  // ═══════════════════════════════════════════
  pageNum++;
  const tocPage = newPage();
  let tocY = drawSectionHeader(tocPage, t('tableOfContents', lang), pageHeight - margin);

  const tocEntries: string[] = [t('ourFamily', lang)];
  if (data.people.length > 0) tocEntries.push(t('familyMembers', lang));
  if (data.stories.length > 0) tocEntries.push(t('storiesAndMemories', lang));
  if (data.interviews.length > 0) tocEntries.push(t('conversations', lang));
  if (data.relationships.length > 0) tocEntries.push(t('familyConnections', lang));

  // Add spacing before entries for a premium feel
  tocY -= 10;
  for (let i = 0; i < tocEntries.length; i++) {
    const entry = tocEntries[i];
    // Chapter number
    const chNum = `${i + 1}`;
    tocPage.drawText(chNum, {
      x: margin + 8 - fonts.sansBold.widthOfTextAtSize(chNum, 11) / 2,
      y: tocY, size: 11, font: fonts.sansBold, color: BRAND.gold,
    });
    // Dotted leader line
    const entryX = margin + 28;
    tocPage.drawText(entry, { x: entryX, y: tocY, size: 14, font: fonts.regular, color: BRAND.darkText });
    const leaderStartX = entryX + fonts.regular.widthOfTextAtSize(entry, 14) + 8;
    const leaderEndX = pageWidth - margin;
    // Draw dot leaders
    for (let lx = leaderStartX; lx < leaderEndX - 4; lx += 6) {
      tocPage.drawCircle({ x: lx, y: tocY + 3, size: 0.5, color: BRAND.lightLine });
    }
    tocY -= 36;
  }
  drawFooter(tocPage, pageNum);

  // ═══════════════════════════════════════════
  // OUR FAMILY (overview)
  // ═══════════════════════════════════════════
  pageNum++;
  let page = newPage();
  let y = drawSectionHeader(page, t('ourFamily', lang), pageHeight - margin);

  if (data.familyGroup?.description) {
    // Draw a decorative left quote accent
    page.drawLine({
      start: { x: margin + 8, y: y + 4 },
      end: { x: margin + 8, y: y - 40 },
      thickness: 2, color: BRAND.gold,
    });
    const res = drawWrappedText(
      { page, y }, data.familyGroup.description, margin + 20,
      fonts.italic, 12, BRAND.mutedText, contentWidth - 20, undefined,
      (pg) => { drawFooter(pg, pageNum); pageNum++; }
    );
    page = res.page; y = res.y - 20;
  }

  // Stats card — premium elevated design
  const cardH = 90;
  const cardY = y - cardH;
  // Card shadow (subtle offset rectangle)
  page.drawRectangle({
    x: margin + 2, y: cardY - 2, width: contentWidth, height: cardH,
    color: BRAND.lightLine,
  });
  // Card background
  page.drawRectangle({
    x: margin, y: cardY, width: contentWidth, height: cardH,
    color: BRAND.white, borderColor: BRAND.gold, borderWidth: 1,
  });
  // Gold top accent line
  page.drawLine({
    start: { x: margin, y: cardY + cardH },
    end: { x: margin + contentWidth, y: cardY + cardH },
    thickness: 2.5, color: BRAND.gold,
  });

  const statItems = [
    { label: t('people', lang), value: `${data.people.length}` },
    { label: t('stories', lang), value: `${data.stories.length}` },
    { label: t('conversations', lang), value: `${data.interviews.length}` },
    { label: t('connections', lang), value: `${data.relationships.length}` },
  ];
  const statW = contentWidth / statItems.length;
  statItems.forEach((stat, i) => {
    const sx = margin + statW * i + statW / 2;
    // Vertical separator between stats (except first)
    if (i > 0) {
      page.drawLine({
        start: { x: margin + statW * i, y: cardY + 15 },
        end: { x: margin + statW * i, y: cardY + cardH - 15 },
        thickness: 0.5, color: BRAND.lightLine,
      });
    }
    page.drawText(stat.value, {
      x: sx - fonts.sansBold.widthOfTextAtSize(stat.value, 26) / 2, y: cardY + 42,
      size: 26, font: fonts.sansBold, color: BRAND.green,
    });
    page.drawText(stat.label, {
      x: sx - fonts.sans.widthOfTextAtSize(stat.label, 9.5) / 2, y: cardY + 20,
      size: 9.5, font: fonts.sans, color: BRAND.mutedText,
    });
  });
  drawFooter(page, pageNum);

  // ═══════════════════════════════════════════
  // FAMILY MEMBERS
  // ═══════════════════════════════════════════
  if (data.people.length > 0) {
    pageNum++;
    page = newPage();
    y = drawSectionHeader(page, t('familyMembers', lang), pageHeight - margin);

    const AVATAR_SIZE = 150;
    const AVATAR_GAP = 20;
    const AVATAR_BORDER = 3;
    let personIndex = 0;

    for (const person of data.people) {
      const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ');
      const avatar = avatarImages[person.id] || null;
      const hasBio = !!(person.ai_biography || person.ai_summary);

      if (y < margin + 250) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      // Build details and relationships
      const details: string[] = [];
      if (person.birth_date) {
        details.push(person.death_date
          ? `${formatDate(person.birth_date)} - ${formatDate(person.death_date)}`
          : `${formatDate(person.birth_date)}`);
      }
      if (person.birth_place) details.push(person.birth_place);
      if (person.current_location) details.push(`${t('livesIn', lang)} ${person.current_location}`);

      const personRels = data.relationships.filter(
        (r: any) => r.person_a_id === person.id || r.person_b_id === person.id
      );
      const relTexts = personRels.length > 0
        ? personRels.slice(0, 6).map((r: any) => {
            const otherId = r.person_a_id === person.id ? r.person_b_id : r.person_a_id;
            const other = data.people.find((p: any) => p.id === otherId);
            const otherName = other ? [other.first_name, other.last_name].filter(Boolean).join(' ') : t('unknown', lang);
            return `${getRelLabel(r.relationship_type, lang)}: ${otherName}`;
          })
        : [];

      if (hasBio && avatar) {
        // ── TWO-COLUMN LAYOUT (bio + avatar) ──
        const blockTopY = y;
        const imgX = margin;

        // LEFT COL: Avatar
        page.drawRectangle({
          x: imgX - AVATAR_BORDER, y: blockTopY - AVATAR_SIZE - AVATAR_BORDER,
          width: AVATAR_SIZE + AVATAR_BORDER * 2, height: AVATAR_SIZE + AVATAR_BORDER * 2,
          borderColor: BRAND.gold, borderWidth: 2,
        });
        page.drawImage(avatar, {
          x: imgX, y: blockTopY - AVATAR_SIZE, width: AVATAR_SIZE, height: AVATAR_SIZE,
        });

        let leftY = blockTopY - AVATAR_SIZE - AVATAR_BORDER - 20;

        // LEFT COL: Detail tags below avatar
        for (const detail of details) {
          const detRes = drawWrappedText(
            { page, y: leftY }, detail, imgX,
            fonts.sans, 9, BRAND.mutedText, AVATAR_SIZE, 13,
            (pg: any) => { drawFooter(pg, pageNum); pageNum++; }
          );
          page = detRes.page; leftY = detRes.y;
        }

        // LEFT COL: Relationship tags
        if (relTexts.length > 0) {
          leftY -= 4;
          for (const relLine of relTexts) {
            const relRes = drawWrappedText(
              { page, y: leftY }, relLine, imgX,
              fonts.sans, 8.5, BRAND.mutedText, AVATAR_SIZE, 12,
              (pg: any) => { drawFooter(pg, pageNum); pageNum++; }
            );
            page = relRes.page; leftY = relRes.y;
          }
        }

        // RIGHT COL: Name
        const rightColX = margin + AVATAR_SIZE + AVATAR_GAP;
        const rightColWidth = contentWidth - AVATAR_SIZE - AVATAR_GAP;
        let rightY = blockTopY;

        page.drawText(sanitize(fullName), { x: rightColX, y: rightY, size: 17, font: fonts.bold, color: BRAND.darkText });
        rightY -= 22;

        // RIGHT COL: Biography
        const bioText = person.ai_biography || person.ai_summary;
        const bioFont = person.ai_biography ? fonts.regular : fonts.italic;
        const bioColor = person.ai_biography ? BRAND.darkText : BRAND.mutedText;

        const bioRes = drawWrappedText(
          { page, y: rightY }, bioText, rightColX, bioFont, 10.5, bioColor, rightColWidth, 15,
          (pg: any) => { drawFooter(pg, pageNum); pageNum++; }
        );
        page = bioRes.page; rightY = bioRes.y;

        y = Math.min(leftY, rightY) - 8;

      } else {
        // ── STANDARD LAYOUT (no bio, or no avatar) ──
        const imageOnRight = personIndex % 2 === 1;
        personIndex++;

        const blockTopY = y;
        const imgX = avatar
          ? (imageOnRight ? margin + contentWidth - AVATAR_SIZE : margin)
          : 0;
        if (avatar) {
          page.drawRectangle({
            x: imgX - AVATAR_BORDER, y: blockTopY - AVATAR_SIZE - AVATAR_BORDER,
            width: AVATAR_SIZE + AVATAR_BORDER * 2, height: AVATAR_SIZE + AVATAR_BORDER * 2,
            borderColor: BRAND.gold, borderWidth: 2,
          });
          page.drawImage(avatar, {
            x: imgX, y: blockTopY - AVATAR_SIZE, width: AVATAR_SIZE, height: AVATAR_SIZE,
          });
        }

        const textX = avatar
          ? (imageOnRight ? margin : margin + AVATAR_SIZE + AVATAR_GAP)
          : margin;
        const textWidth = avatar ? contentWidth - AVATAR_SIZE - AVATAR_GAP : contentWidth;
        let ty = blockTopY;

        page.drawText(sanitize(fullName), { x: textX, y: ty, size: 17, font: fonts.bold, color: BRAND.darkText });
        ty -= 22;

        if (details.length > 0) {
          const detailRes = drawWrappedText(
            { page, y: ty }, details.join('  \u00b7  '), textX,
            fonts.sans, 9.5, BRAND.mutedText, textWidth, 14,
            (pg: any) => { drawFooter(pg, pageNum); pageNum++; }
          );
          page = detailRes.page; ty = detailRes.y;
        }

        if (relTexts.length > 0) {
          ty -= 4;
          const relResult = drawWrappedText(
            { page, y: ty }, relTexts.join('  \u00b7  '), textX,
            fonts.sans, 8.5, BRAND.mutedText, textWidth, 13,
            (pg: any) => { drawFooter(pg, pageNum); pageNum++; }
          );
          page = relResult.page; ty = relResult.y;
        }

        const imgBottomY = blockTopY - AVATAR_SIZE - AVATAR_BORDER - 18;
        y = avatar ? Math.min(ty, imgBottomY) : ty;
      }

      y -= 5;
      y = drawDivider(page, y);
    }
    drawFooter(page, pageNum);
  }

  // ═══════════════════════════════════════════
  // STORIES
  // ═══════════════════════════════════════════
  if (data.stories.length > 0) {
    pageNum++;
    page = newPage();
    y = drawSectionHeader(page, t('storiesAndMemories', lang), pageHeight - margin);

    for (const story of data.stories) {
      if (y < margin + 120) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      // Story title — larger, more prominent
      page.drawText(sanitize(story.title || t('untitledStory', lang)), { x: margin, y, size: 16, font: fonts.bold, color: BRAND.darkText });
      y -= 20;

      // Metadata line with gold accents
      const meta: string[] = [];
      if (story.event_date) meta.push(formatDate(story.event_date));
      if (story.event_location) meta.push(story.event_location);
      const peoplInStory = data.storyPeople
        .filter((sp: any) => sp.story_id === story.id)
        .map((sp: any) => { const p = data.people.find((pp: any) => pp.id === sp.person_id); return p?.first_name; })
        .filter(Boolean);
      if (peoplInStory.length > 0) meta.push(`${t('featuring', lang)} ${peoplInStory.join(', ')}`);
      if (meta.length > 0) {
        page.drawText(sanitize(meta.join('  ·  ')), { x: margin, y, size: 9.5, font: fonts.sans, color: BRAND.gold });
        y -= 18;
      }

      // Story content — FULL text, no truncation
      if (story.content) {
        const res = drawWrappedText({ page, y }, story.content, margin, fonts.regular, 10.5, BRAND.darkText, contentWidth, 15,
          (pg) => { drawFooter(pg, pageNum); pageNum++; }
        );
        page = res.page; y = res.y;
      }

      if (story.ai_generated) {
        y -= 5;
        page.drawText(t('aiCrafted', lang), { x: margin, y, size: 7.5, font: fonts.italic, color: BRAND.mutedText });
        y -= 12;
      }

      y -= 10;
      y = drawDivider(page, y);
    }
    drawFooter(page, pageNum);
  }

  // ═══════════════════════════════════════════
  // CONVERSATIONS
  // ═══════════════════════════════════════════
  if (data.interviews.length > 0) {
    pageNum++;
    page = newPage();
    y = drawSectionHeader(page, t('conversations', lang), pageHeight - margin);

    for (const interview of data.interviews) {
      if (y < margin + 120) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      // Conversation title — larger
      page.drawText(sanitize(interview.title || t('untitledConversation', lang)), {
        x: margin, y, size: 15, font: fonts.bold, color: BRAND.darkText,
      });
      y -= 20;

      // Date with subtle styling
      const convDateObj = new Date(interview.created_at);
      const convDate = formatDate(convDateObj.toISOString().split('T')[0]);
      page.drawText(convDate, { x: margin, y, size: 9.5, font: fonts.sans, color: BRAND.mutedText });

      // Subject person name alongside date if available
      if (interview.subject_person_id) {
        const subject = data.people.find((p: any) => p.id === interview.subject_person_id);
        if (subject) {
          const subName = [subject.first_name, subject.last_name].filter(Boolean).join(' ');
          const dateW = fonts.sans.widthOfTextAtSize(convDate, 9.5);
          page.drawText(sanitize(`  ·  ${subName}`), {
            x: margin + dateW, y, size: 9.5, font: fonts.sans, color: BRAND.gold,
          });
        }
      }
      y -= 18;

      // Key topics as styled tags
      if (interview.ai_key_topics?.length > 0) {
        const topics = interview.ai_key_topics.slice(0, 8);
        let topicX = margin;
        for (const topic of topics) {
          const topicText = sanitize(topic);
          const tw = fonts.sans.widthOfTextAtSize(topicText, 8) + 12;
          // Check if topic fits on current line
          if (topicX + tw > pageWidth - margin) {
            topicX = margin;
            y -= 18;
          }
          // Tag background
          page.drawRectangle({
            x: topicX, y: y - 4,
            width: tw, height: 15,
            color: BRAND.white, borderColor: BRAND.gold, borderWidth: 0.5,
          });
          page.drawText(topicText, {
            x: topicX + 6, y: y, size: 8, font: fonts.sans, color: BRAND.gold,
          });
          topicX += tw + 6;
        }
        y -= 22;
      }

      // AI Summary — FULL text, no truncation
      if (interview.ai_summary) {
        const res = drawWrappedText({ page, y }, interview.ai_summary, margin, fonts.italic, 10.5, BRAND.mutedText, contentWidth, 15,
          (pg) => { drawFooter(pg, pageNum); pageNum++; }
        );
        page = res.page; y = res.y;
      }

      y -= 8;
      y = drawDivider(page, y);
    }
    drawFooter(page, pageNum);
  }

  // ═══════════════════════════════════════════
  // FAMILY CONNECTIONS (Node Graph)
  // ═══════════════════════════════════════════
  if (data.relationships.length > 0) {
    pageNum++;
    page = newPage();
    y = drawSectionHeader(page, t('familyConnections', lang), pageHeight - margin);

    // ── Build adjacency maps ──
    const childrenOf = new Map<string, string[]>();
    const parentOfMap = new Map<string, string[]>();
    const spouseOf = new Map<string, Set<string>>();
    const siblingOf = new Map<string, Set<string>>();

    for (const rel of data.relationships) {
      const { person_a_id: a, person_b_id: b, relationship_type: type } = rel;
      if (type === 'parent') {
        if (!childrenOf.has(a)) childrenOf.set(a, []);
        childrenOf.get(a)!.push(b);
        if (!parentOfMap.has(b)) parentOfMap.set(b, []);
        parentOfMap.get(b)!.push(a);
      } else if (type === 'spouse' || type === 'ex_spouse') {
        if (!spouseOf.has(a)) spouseOf.set(a, new Set());
        if (!spouseOf.has(b)) spouseOf.set(b, new Set());
        spouseOf.get(a)!.add(b);
        spouseOf.get(b)!.add(a);
      } else if (type === 'sibling' || type === 'half_sibling' || type === 'step_sibling') {
        if (!siblingOf.has(a)) siblingOf.set(a, new Set());
        if (!siblingOf.has(b)) siblingOf.set(b, new Set());
        siblingOf.get(a)!.add(b);
        siblingOf.get(b)!.add(a);
      }
    }

    // ── BFS from self person (the app user) ──
    const selfId = data.selfPersonId || data.people[0]?.id;
    const generation = new Map<string, number>();

    generation.set(selfId, 0);
    const queue: string[] = [selfId];
    while (queue.length > 0) {
      const pid = queue.shift()!;
      const gen = generation.get(pid)!;
      for (const sid of (spouseOf.get(pid) || [])) {
        if (!generation.has(sid)) { generation.set(sid, gen); queue.push(sid); }
      }
      for (const cid of (childrenOf.get(pid) || [])) {
        if (!generation.has(cid)) { generation.set(cid, gen + 1); queue.push(cid); }
      }
      for (const ppid of (parentOfMap.get(pid) || [])) {
        if (!generation.has(ppid)) { generation.set(ppid, gen - 1); queue.push(ppid); }
      }
      for (const sid of (siblingOf.get(pid) || [])) {
        if (!generation.has(sid)) { generation.set(sid, gen); queue.push(sid); }
      }
    }
    for (const p of data.people) {
      if (!generation.has(p.id)) generation.set(p.id, 0);
    }

    // ── Group by generation ──
    const genGroups = new Map<number, string[]>();
    for (const [pid, gen] of generation) {
      if (!genGroups.has(gen)) genGroups.set(gen, []);
      genGroups.get(gen)!.push(pid);
    }
    const sortedGens = [...genGroups.keys()].sort((a, b) => a - b);

    // ── Layout: fit tightly within page margins ──
    const NODE_RADIUS = 20;
    const LABEL_OFFSET = 13;
    const graphTopY = y - 15;
    const graphBottomY = margin + 50;
    const graphLeftX = margin + NODE_RADIUS + 5;
    const graphRightX = pageWidth - margin - NODE_RADIUS - 5;
    const graphCenterX = (graphLeftX + graphRightX) / 2;
    const availH = graphTopY - graphBottomY;
    const availW = graphRightX - graphLeftX;

    const maxPerRow = Math.max(...sortedGens.map((g: number) => genGroups.get(g)!.length));
    const H_SPACING = Math.min(100, availW / Math.max(maxPerRow, 1));
    const V_SPACING = Math.min(110, availH / Math.max(sortedGens.length, 1));

    const positions = new Map<string, { x: number; y: number }>();
    for (let gi = 0; gi < sortedGens.length; gi++) {
      const gen = sortedGens[gi];
      const members = genGroups.get(gen)!;

      const sorted: string[] = [];
      const placed = new Set<string>();
      if (members.includes(selfId) && !placed.has(selfId)) {
        sorted.push(selfId);
        placed.add(selfId);
        for (const sid of (spouseOf.get(selfId) || [])) {
          if (members.includes(sid) && !placed.has(sid)) {
            sorted.push(sid);
            placed.add(sid);
          }
        }
      }
      for (const pid of members) {
        if (placed.has(pid)) continue;
        sorted.push(pid);
        placed.add(pid);
        for (const sid of (spouseOf.get(pid) || [])) {
          if (members.includes(sid) && !placed.has(sid)) {
            sorted.push(sid);
            placed.add(sid);
          }
        }
      }

      const rowW = sorted.length * H_SPACING;
      const startX = graphCenterX - rowW / 2 + H_SPACING / 2;
      const posY = graphTopY - gi * V_SPACING;

      for (let xi = 0; xi < sorted.length; xi++) {
        const rawX = startX + xi * H_SPACING;
        const clampedX = Math.max(graphLeftX, Math.min(graphRightX, rawX));
        positions.set(sorted[xi], { x: clampedX, y: posY });
      }
    }

    // ── Center graph vertically in available space ──
    if (positions.size > 0) {
      let minY = Infinity, maxY = -Infinity;
      for (const pos of positions.values()) {
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
      }
      const totalTop = maxY + NODE_RADIUS + 4;
      const totalBottom = minY - NODE_RADIUS - LABEL_OFFSET - 15;
      const targetCenterY = (graphTopY + graphBottomY) / 2;
      const currentCenterY = (totalTop + totalBottom) / 2;
      const offsetY = targetCenterY - currentCenterY;
      for (const pos of positions.values()) {
        pos.y += offsetY;
      }
    }

    // ── Build relationship label lookup (relative to self) ──
    // Invert type when self is person_a: "self is parent of X" → X is "child" to self
    const INVERSE_REL: Record<string, string> = {
      parent: 'child', child: 'parent',
      grandparent: 'grandchild', grandchild: 'grandparent',
      uncle_aunt: 'nephew_niece', nephew_niece: 'uncle_aunt',
      step_parent: 'step_child', step_child: 'step_parent',
      adopted_parent: 'adopted_child', adopted_child: 'adopted_parent',
      godparent: 'godchild', godchild: 'godparent',
    };
    const relToSelf = new Map<string, string>();
    for (const rel of data.relationships) {
      if (rel.person_a_id === selfId) {
        relToSelf.set(rel.person_b_id, INVERSE_REL[rel.relationship_type] || rel.relationship_type);
      }
      if (rel.person_b_id === selfId) {
        relToSelf.set(rel.person_a_id, rel.relationship_type);
      }
    }

    // Soft connector colors (simulate opacity by blending toward cream background)
    const SOFT_GOLD = rgb(
      (196 * 0.35 + 247 * 0.65) / 255,
      (154 * 0.35 + 242 * 0.65) / 255,
      (60 * 0.35 + 234 * 0.65) / 255,
    );
    const SOFT_GREEN = rgb(
      (22 * 0.3 + 247 * 0.7) / 255,
      (67 * 0.3 + 242 * 0.7) / 255,
      (28 * 0.3 + 234 * 0.7) / 255,
    );
    const SOFT_MUTED = rgb(
      (107 * 0.3 + 247 * 0.7) / 255,
      (93 * 0.3 + 242 * 0.7) / 255,
      (79 * 0.3 + 234 * 0.7) / 255,
    );

    // ── Draw edges ──
    const drawnSpouses = new Set<string>();
    for (const rel of data.relationships) {
      if (rel.relationship_type !== 'spouse' && rel.relationship_type !== 'ex_spouse') continue;
      const key = [rel.person_a_id, rel.person_b_id].sort().join('-');
      if (drawnSpouses.has(key)) continue;
      drawnSpouses.add(key);
      const posA = positions.get(rel.person_a_id);
      const posB = positions.get(rel.person_b_id);
      if (!posA || !posB) continue;
      const isDashed = rel.relationship_type === 'ex_spouse';
      const leftPos = posA.x < posB.x ? posA : posB;
      const rightPos = posA.x < posB.x ? posB : posA;
      const leftX = leftPos.x + NODE_RADIUS;
      const rightX = rightPos.x - NODE_RADIUS;
      const lineY = posA.y;
      if (!isDashed) {
        page.drawLine({
          start: { x: leftX, y: lineY }, end: { x: rightX, y: lineY },
          thickness: 1, color: SOFT_GOLD,
        });
      } else {
        for (let dx = leftX; dx < rightX - 4; dx += 8) {
          page.drawLine({
            start: { x: dx, y: lineY }, end: { x: Math.min(dx + 4, rightX), y: lineY },
            thickness: 0.8, color: SOFT_MUTED,
          });
        }
      }
    }

    const drawnParentChild = new Set<string>();
    for (const rel of data.relationships) {
      if (rel.relationship_type !== 'parent') continue;
      const key = `${rel.person_a_id}-${rel.person_b_id}`;
      if (drawnParentChild.has(key)) continue;
      drawnParentChild.add(key);
      const parentPos = positions.get(rel.person_a_id);
      const childPos = positions.get(rel.person_b_id);
      if (!parentPos || !childPos) continue;
      const startY = parentPos.y - NODE_RADIUS;
      const endY = childPos.y + NODE_RADIUS;
      const midY = (startY + endY) / 2;
      page.drawLine({
        start: { x: parentPos.x, y: startY },
        end: { x: parentPos.x, y: midY },
        thickness: 0.8, color: SOFT_GREEN,
      });
      page.drawLine({
        start: { x: parentPos.x, y: midY },
        end: { x: childPos.x, y: midY },
        thickness: 0.8, color: SOFT_GREEN,
      });
      page.drawLine({
        start: { x: childPos.x, y: midY },
        end: { x: childPos.x, y: endY },
        thickness: 0.8, color: SOFT_GREEN,
      });
    }

    const drawnSiblings = new Set<string>();
    for (const rel of data.relationships) {
      if (rel.relationship_type !== 'sibling' && rel.relationship_type !== 'half_sibling') continue;
      const key = [rel.person_a_id, rel.person_b_id].sort().join('-');
      if (drawnSiblings.has(key)) continue;
      drawnSiblings.add(key);
      const posA = positions.get(rel.person_a_id);
      const posB = positions.get(rel.person_b_id);
      if (!posA || !posB) continue;
      const leftPos = posA.x < posB.x ? posA : posB;
      const rightPos = posA.x < posB.x ? posB : posA;
      const arcY = leftPos.y - NODE_RADIUS - 3;
      page.drawLine({
        start: { x: leftPos.x + NODE_RADIUS, y: arcY },
        end: { x: rightPos.x - NODE_RADIUS, y: arcY },
        thickness: 0.5, color: SOFT_MUTED,
      });
    }

    // ── Draw nodes ──
    for (const person of data.people) {
      const pos = positions.get(person.id);
      if (!pos) continue;
      const isSelf = person.id === selfId;

      page.drawCircle({ x: pos.x, y: pos.y, size: NODE_RADIUS + 4, color: isSelf ? BRAND.gold : BRAND.lightLine });
      page.drawCircle({
        x: pos.x, y: pos.y, size: NODE_RADIUS,
        color: BRAND.green, borderColor: isSelf ? BRAND.gold : BRAND.lightLine, borderWidth: isSelf ? 2.5 : 1.5,
      });

      const avatar = avatarImages[person.id];
      if (avatar) {
        const imgSize = NODE_RADIUS * 1.4;
        page.drawImage(avatar, {
          x: pos.x - imgSize / 2, y: pos.y - imgSize / 2,
          width: imgSize, height: imgSize,
        });
        page.drawCircle({
          x: pos.x, y: pos.y, size: NODE_RADIUS,
          borderColor: isSelf ? BRAND.gold : BRAND.lightLine, borderWidth: isSelf ? 2.5 : 1.5,
        });
      } else {
        const initials = [person.first_name?.[0], person.last_name?.[0]].filter(Boolean).join('');
        const iw = fonts.sansBold.widthOfTextAtSize(initials, 12);
        page.drawText(initials, {
          x: pos.x - iw / 2, y: pos.y - 4,
          size: 12, font: fonts.sansBold, color: BRAND.cream,
        });
      }

      const firstName = sanitize(person.first_name || '');
      const fnW = fonts.sansBold.widthOfTextAtSize(firstName, 8.5);
      page.drawText(firstName, {
        x: pos.x - fnW / 2, y: pos.y - NODE_RADIUS - LABEL_OFFSET,
        size: 8.5, font: fonts.sansBold, color: BRAND.darkText,
      });

      if (!isSelf) {
        const relType = relToSelf.get(person.id);
        if (relType) {
          const relTag = sanitize(getRelLabel(relType, lang));
          const rtW = fonts.sans.widthOfTextAtSize(relTag, 7);
          page.drawText(relTag, {
            x: pos.x - rtW / 2, y: pos.y - NODE_RADIUS - LABEL_OFFSET - 11,
            size: 7, font: fonts.sans, color: BRAND.gold,
          });
        }
      } else {
        const meLabel = lang === 'es' ? 'Yo' : 'Me';
        const meW = fonts.sansBold.widthOfTextAtSize(meLabel, 7);
        page.drawText(meLabel, {
          x: pos.x - meW / 2, y: pos.y - NODE_RADIUS - LABEL_OFFSET - 11,
          size: 7, font: fonts.sansBold, color: BRAND.gold,
        });
      }
    }

    drawFooter(page, pageNum);
  }

  // ═══════════════════════════════════════════
  // BACK COVER
  // ═══════════════════════════════════════════
  const back = pdf.addPage([pageWidth, pageHeight]);
  back.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: BRAND.cream });
  // Double border frame (matching cover)
  back.drawRectangle({
    x: borderInset, y: borderInset,
    width: pageWidth - borderInset * 2, height: pageHeight - borderInset * 2,
    borderColor: BRAND.gold, borderWidth: 2,
  });
  back.drawRectangle({
    x: borderInset + 6, y: borderInset + 6,
    width: pageWidth - borderInset * 2 - 12, height: pageHeight - borderInset * 2 - 12,
    borderColor: BRAND.gold, borderWidth: 0.5,
  });
  // Corner ornaments
  for (const cx of [borderInset - co / 2, pageWidth - borderInset - co / 2]) {
    for (const cy of [borderInset - co / 2, pageHeight - borderInset - co / 2]) {
      back.drawRectangle({ x: cx, y: cy, width: co, height: co, color: BRAND.gold });
    }
  }

  if (logotypeImage) {
    const ltDim = logotypeImage.scale(0.45);
    const ltW = Math.min(ltDim.width, 300);
    const ltH = ltW * (ltDim.height / ltDim.width);
    back.drawImage(logotypeImage, {
      x: (pageWidth - ltW) / 2, y: pageHeight / 2 + 10, width: ltW, height: ltH,
    });
  }

  const tagline = t('tagline', lang);
  back.drawText(tagline, {
    x: (pageWidth - fonts.italic.widthOfTextAtSize(tagline, 13)) / 2,
    y: pageHeight / 2 - 30, size: 13, font: fonts.italic, color: BRAND.darkText,
  });

  // Decorative ornament below tagline
  const backCX = pageWidth / 2;
  back.drawLine({
    start: { x: backCX - 60, y: pageHeight / 2 - 50 },
    end: { x: backCX - 8, y: pageHeight / 2 - 50 },
    thickness: 0.5, color: BRAND.gold,
  });
  back.drawRectangle({
    x: backCX - 3, y: pageHeight / 2 - 53,
    width: 6, height: 6, color: BRAND.gold,
  });
  back.drawLine({
    start: { x: backCX + 8, y: pageHeight / 2 - 50 },
    end: { x: backCX + 60, y: pageHeight / 2 - 50 },
    thickness: 0.5, color: BRAND.gold,
  });

  const genText = `${t('generatedOn', lang)} ${dateText}`;
  back.drawText(genText, {
    x: (pageWidth - fonts.sans.widthOfTextAtSize(genText, 8)) / 2,
    y: borderInset + 30, size: 8, font: fonts.sans, color: BRAND.gold,
  });

  // Metadata
  pdf.setTitle(`${familyName} — Memory Book`);
  pdf.setAuthor('Matra');
  pdf.setSubject('Family Memory Book');
  pdf.setCreator('Matra — A living tree of your ancestry');
  pdf.setCreationDate(new Date());

  return pdf.save();
}

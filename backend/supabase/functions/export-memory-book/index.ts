// ============================================================
// MATRA — Export Memory Book Edge Function
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

const BANNER_KEY = 'matra/assets/lake-boat-nobg.png';
const LOGOTYPE_KEY = 'matra/assets/logotype.png';

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
      supabase.from('profiles').select('display_name, preferences').eq('id', userId).single(),
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

  // Fetch and embed logo images (signed URLs for private bucket)
  // PNG embedding is CPU-intensive; skip images larger than 500KB to avoid edge runtime CPU limits
  // For best results, keep logo PNGs under ~600px wide
  const MAX_IMAGE_BYTES = 500_000;
  let bannerImage: any = null;
  let logotypeImage: any = null;
  try {
    const [bannerUrl, logotypeUrl] = await Promise.all([
      getPresignedUrl(BANNER_KEY),
      getPresignedUrl(LOGOTYPE_KEY),
    ]);
    const [bannerResp, logotypeResp] = await Promise.all([
      fetch(bannerUrl),
      fetch(logotypeUrl),
    ]);
    const [bannerBytes, logotypeBytes] = await Promise.all([
      bannerResp.ok ? bannerResp.arrayBuffer() : null,
      logotypeResp.ok ? logotypeResp.arrayBuffer() : null,
    ]);
    if (bannerBytes && bannerBytes.byteLength <= MAX_IMAGE_BYTES) {
      bannerImage = await pdf.embedPng(new Uint8Array(bannerBytes));
    }
    if (logotypeBytes && logotypeBytes.byteLength <= MAX_IMAGE_BYTES) {
      logotypeImage = await pdf.embedPng(new Uint8Array(logotypeBytes));
    }
  } catch (e) { console.warn('Image embed skipped:', e); }

  const { pageWidth, pageHeight, margin } = BRAND;
  const contentWidth = pageWidth - margin * 2;
  const borderInset = 30;

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
    p.drawLine({
      start: { x: margin, y: atY }, end: { x: pageWidth - margin, y: atY },
      thickness: 0.5, color: BRAND.lightLine,
    });
    return atY - 20;
  }

  function drawSectionHeader(p: any, title: string, atY: number): number {
    p.drawText(title, { x: margin, y: atY, size: 24, font: fonts.bold, color: BRAND.green });
    atY -= 8;
    const underW = Math.min(fonts.bold.widthOfTextAtSize(title, 24) + 10, contentWidth);
    p.drawLine({
      start: { x: margin, y: atY }, end: { x: margin + underW, y: atY },
      thickness: 1.5, color: BRAND.gold,
    });
    return atY - 30;
  }

  // Wraps text across lines, adding new pages when needed. Returns { page, y }.
  function drawWrappedText(
    ctx: { page: any; y: number },
    text: string, x: number, font: any, size: number, color: any,
    maxWidth: number, lineHeight?: number
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
  const dateLocale = lang === 'es' ? 'es-ES' : 'en-US';
  const dateText = new Date().toLocaleDateString(dateLocale, { month: 'long', day: 'numeric', year: 'numeric' });
  const familyName = data.familyGroup?.name ||
    (lang === 'es' ? `Familia de ${data.profileName}` : `${data.profileName}'s Family`);

  // ═══════════════════════════════════════════
  // COVER PAGE
  // ═══════════════════════════════════════════
  const cover = pdf.addPage([pageWidth, pageHeight]);
  cover.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: BRAND.green });
  cover.drawRectangle({
    x: borderInset, y: borderInset,
    width: pageWidth - borderInset * 2, height: pageHeight - borderInset * 2,
    borderColor: BRAND.gold, borderWidth: 1.5,
  });

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
    size: titleSize, font: fonts.bold, color: BRAND.cream,
  });

  const subtitle = t('memoryBook', lang);
  cover.drawText(subtitle, {
    x: (pageWidth - fonts.italic.widthOfTextAtSize(subtitle, 20)) / 2,
    y: centerY + 15, size: 20, font: fonts.italic, color: BRAND.gold,
  });

  cover.drawLine({
    start: { x: pageWidth / 2 - 60, y: centerY - 5 },
    end: { x: pageWidth / 2 + 60, y: centerY - 5 },
    thickness: 1, color: BRAND.gold,
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

  for (const entry of tocEntries) {
    tocPage.drawText('\u2022', { x: margin + 5, y: tocY + 1, size: 10, font: fonts.sans, color: BRAND.gold });
    tocPage.drawText(entry, { x: margin + 22, y: tocY, size: 13, font: fonts.regular, color: BRAND.darkText });
    tocY -= 28;
  }
  drawFooter(tocPage, pageNum);

  // ═══════════════════════════════════════════
  // OUR FAMILY (overview)
  // ═══════════════════════════════════════════
  pageNum++;
  let page = newPage();
  let y = drawSectionHeader(page, t('ourFamily', lang), pageHeight - margin);

  if (data.familyGroup?.description) {
    const res = drawWrappedText(
      { page, y }, data.familyGroup.description, margin,
      fonts.italic, 11, BRAND.mutedText, contentWidth
    );
    page = res.page; y = res.y - 15;
  }

  // Stats card
  const cardH = 70;
  page.drawRectangle({
    x: margin, y: y - cardH, width: contentWidth, height: cardH,
    color: BRAND.white, borderColor: BRAND.lightLine, borderWidth: 1,
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
    page.drawText(stat.value, {
      x: sx - fonts.sansBold.widthOfTextAtSize(stat.value, 22) / 2, y: y - 30,
      size: 22, font: fonts.sansBold, color: BRAND.green,
    });
    page.drawText(stat.label, {
      x: sx - fonts.sans.widthOfTextAtSize(stat.label, 9) / 2, y: y - 48,
      size: 9, font: fonts.sans, color: BRAND.mutedText,
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

    for (const person of data.people) {
      const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ');

      if (y < margin + 120) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      // Name
      page.drawText(sanitize(fullName), { x: margin, y, size: 15, font: fonts.bold, color: BRAND.darkText });
      y -= 18;

      // Details
      const details: string[] = [];
      if (person.birth_date) {
        details.push(person.death_date ? `${person.birth_date} \u2013 ${person.death_date}` : `${t('born', lang)} ${person.birth_date}`);
      }
      if (person.birth_place) details.push(person.birth_place);
      if (person.current_location) details.push(`${t('livesIn', lang)} ${person.current_location}`);
      if (details.length > 0) {
        page.drawText(sanitize(details.join('  ·  ')), { x: margin, y, size: 9, font: fonts.sans, color: BRAND.mutedText });
        y -= 15;
      }

      // Relationships
      const personRels = data.relationships.filter(
        (r: any) => r.person_a_id === person.id || r.person_b_id === person.id
      );
      if (personRels.length > 0) {
        const relTexts = personRels.slice(0, 4).map((r: any) => {
          const otherId = r.person_a_id === person.id ? r.person_b_id : r.person_a_id;
          const other = data.people.find((p: any) => p.id === otherId);
          const otherName = other ? [other.first_name, other.last_name].filter(Boolean).join(' ') : t('unknown', lang);
          return `${getRelLabel(r.relationship_type, lang)}: ${otherName}`;
        });
        page.drawText(sanitize(relTexts.join('  ·  ')), { x: margin, y, size: 8, font: fonts.sans, color: BRAND.mutedText });
        y -= 15;
      }

      // Biography or summary
      if (person.ai_biography) {
        const bio = person.ai_biography.length > 400
          ? person.ai_biography.substring(0, 400) + '…' : person.ai_biography;
        const res = drawWrappedText({ page, y: y - 3 }, bio, margin, fonts.regular, 10, BRAND.darkText, contentWidth, 14);
        page = res.page; y = res.y - 5;
      } else if (person.ai_summary) {
        const sum = person.ai_summary.length > 200
          ? person.ai_summary.substring(0, 200) + '…' : person.ai_summary;
        const res = drawWrappedText({ page, y: y - 3 }, sum, margin, fonts.italic, 10, BRAND.mutedText, contentWidth, 14);
        page = res.page; y = res.y - 5;
      }

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
      if (y < margin + 100) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      page.drawText(sanitize(story.title || t('untitledStory', lang)), { x: margin, y, size: 14, font: fonts.bold, color: BRAND.darkText });
      y -= 16;

      const meta: string[] = [];
      if (story.event_date) meta.push(story.event_date);
      if (story.event_location) meta.push(story.event_location);
      const peoplInStory = data.storyPeople
        .filter((sp: any) => sp.story_id === story.id)
        .map((sp: any) => { const p = data.people.find((pp: any) => pp.id === sp.person_id); return p?.first_name; })
        .filter(Boolean);
      if (peoplInStory.length > 0) meta.push(`${t('featuring', lang)} ${peoplInStory.join(', ')}`);
      if (meta.length > 0) {
        page.drawText(sanitize(meta.join('  ·  ')), { x: margin, y, size: 9, font: fonts.sans, color: BRAND.gold });
        y -= 16;
      }

      if (story.content) {
        const content = story.content.length > 800 ? story.content.substring(0, 800) + '…' : story.content;
        const res = drawWrappedText({ page, y }, content, margin, fonts.regular, 10.5, BRAND.darkText, contentWidth, 15);
        page = res.page; y = res.y;
      }

      if (story.ai_generated) {
        y -= 3;
        page.drawText(t('aiCrafted', lang), { x: margin, y, size: 7, font: fonts.sans, color: BRAND.mutedText });
        y -= 10;
      }

      y -= 8;
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
      if (y < margin + 80) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      page.drawText(sanitize(interview.title || t('untitledConversation', lang)), {
        x: margin, y, size: 13, font: fonts.bold, color: BRAND.darkText,
      });
      y -= 15;

      const convDate = new Date(interview.created_at).toLocaleDateString(dateLocale, {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      page.drawText(convDate, { x: margin, y, size: 9, font: fonts.sans, color: BRAND.mutedText });
      y -= 16;

      if (interview.ai_key_topics?.length > 0) {
        page.drawText(sanitize(interview.ai_key_topics.slice(0, 5).join('  ·  ')), {
          x: margin, y, size: 9, font: fonts.sans, color: BRAND.gold,
        });
        y -= 16;
      }

      if (interview.ai_summary) {
        const summary = interview.ai_summary.length > 300
          ? interview.ai_summary.substring(0, 300) + '…' : interview.ai_summary;
        const res = drawWrappedText({ page, y }, summary, margin, fonts.italic, 10, BRAND.mutedText, contentWidth, 14);
        page = res.page; y = res.y;
      }

      y -= 5;
      y = drawDivider(page, y);
    }
    drawFooter(page, pageNum);
  }

  // ═══════════════════════════════════════════
  // FAMILY CONNECTIONS
  // ═══════════════════════════════════════════
  if (data.relationships.length > 0) {
    pageNum++;
    page = newPage();
    y = drawSectionHeader(page, t('familyConnections', lang), pageHeight - margin);

    for (const rel of data.relationships) {
      if (y < margin + 30) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      const personA = data.people.find((p: any) => p.id === rel.person_a_id);
      const personB = data.people.find((p: any) => p.id === rel.person_b_id);
      const nameA = personA ? [personA.first_name, personA.last_name].filter(Boolean).join(' ') : t('unknown', lang);
      const nameB = personB ? [personB.first_name, personB.last_name].filter(Boolean).join(' ') : t('unknown', lang);
      const relLabel = getRelLabel(rel.relationship_type, lang);
      const connText = sanitize(`${nameA}  -  ${relLabel}  -  ${nameB}`);
      page.drawText(connText, { x: margin, y, size: 10, font: fonts.regular, color: BRAND.darkText });

      if (rel.verified) {
        page.drawText(' (v)', {
          x: margin + fonts.regular.widthOfTextAtSize(connText, 10) + 5, y,
          size: 9, font: fonts.sans, color: BRAND.green,
        });
      }
      y -= 20;
    }
    drawFooter(page, pageNum);
  }

  // ═══════════════════════════════════════════
  // BACK COVER
  // ═══════════════════════════════════════════
  const back = pdf.addPage([pageWidth, pageHeight]);
  back.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: BRAND.green });
  back.drawRectangle({
    x: borderInset, y: borderInset,
    width: pageWidth - borderInset * 2, height: pageHeight - borderInset * 2,
    borderColor: BRAND.gold, borderWidth: 1.5,
  });

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
    x: (pageWidth - fonts.italic.widthOfTextAtSize(tagline, 11)) / 2,
    y: pageHeight / 2 - 30, size: 11, font: fonts.italic, color: BRAND.cream,
  });

  const genText = `${t('generatedOn', lang)} ${dateText}`;
  back.drawText(genText, {
    x: (pageWidth - fonts.sans.widthOfTextAtSize(genText, 8)) / 2,
    y: borderInset + 30, size: 8, font: fonts.sans, color: BRAND.gold,
  });

  // Metadata
  pdf.setTitle(`${familyName} — Memory Book`);
  pdf.setAuthor('MATRA');
  pdf.setSubject('Family Memory Book');
  pdf.setCreator('MATRA — A living tree of your ancestry');
  pdf.setCreationDate(new Date());

  return pdf.save();
}

#!/usr/bin/env node
// ============================================================
// Matra — Memory Book PDF Test Harness
// ============================================================
// Generates a preview PDF with rich mock data for rapid design
// iteration — no Supabase, no auth, no rate limits.
//
// Usage:
//   cd backend/tests
//   npm install pdf-lib    (first time only)
//   node test-memory-book.mjs
//
// Output: memory-book-preview.pdf  (auto-opens on Windows)
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';

// Load env from backend/.env.local
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });

const DO_SPACES_KEY = process.env.DO_SPACES_KEY;
const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET;
const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com';
const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET || 'alquimia-felina-spaces-bucket';

let _s3Client = null;
function getS3Client() {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: 'nyc3',
      endpoint: DO_SPACES_ENDPOINT,
      credentials: { accessKeyId: DO_SPACES_KEY, secretAccessKey: DO_SPACES_SECRET },
      forcePathStyle: false,
    });
  }
  return _s3Client;
}

async function getPresignedUrl(key, expiresIn = 3600) {
  return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: DO_SPACES_BUCKET, Key: key }), { expiresIn });
}

// Keys for brand assets in DO Spaces
const LOGOTYPE_KEY = 'matra/assets/logotype.png';
const MATRA_LOGOTYPE_KEY = 'matra/assets/matra-gold-text.png';
const MATRA_CREAM_KEY = 'matra/assets/matra-cream-text.png';
const CHAIR_ICON_KEY = 'matra/assets/icon-chair-nobg.png';
// The ONE avatar that exists — will be reused for all people
const SHARED_AVATAR_KEY = 'matra/avatars/d3419717-3ca9-4ae5-8e5d-6705c1b43be8_1772782064115.jpg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, 'memory-book-preview.pdf');

// ── Brand Constants (mirror edge function) ──
const BRAND = {
  green: rgb(22 / 255, 67 / 255, 28 / 255),
  cream: rgb(247 / 255, 242 / 255, 234 / 255),
  gold: rgb(196 / 255, 154 / 255, 60 / 255),
  darkText: rgb(59 / 255, 46 / 255, 30 / 255),
  mutedText: rgb(107 / 255, 93 / 255, 79 / 255),
  lightLine: rgb(228 / 255, 221 / 255, 210 / 255),
  white: rgb(1, 1, 1),
  pageWidth: PageSizes.A4[0],
  pageHeight: PageSizes.A4[1],
  margin: 50,
};

// ── i18n (English only for testing) ──
const PDF_STRINGS = {
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
};

function t(key) { return PDF_STRINGS[key] || key; }

const REL_LABELS = {
  parent: 'Parent', child: 'Child', spouse: 'Spouse', ex_spouse: 'Ex-Spouse',
  sibling: 'Sibling', half_sibling: 'Half Sibling', step_sibling: 'Step Sibling',
  grandparent: 'Grandparent', grandchild: 'Grandchild',
  uncle_aunt: 'Uncle/Aunt', nephew_niece: 'Nephew/Niece', cousin: 'Cousin',
  in_law: 'In-law', step_parent: 'Step Parent', step_child: 'Step Child',
  godparent: 'Godparent', godchild: 'Godchild',
  adopted_parent: 'Adopted Parent', adopted_child: 'Adopted Child', other: 'Other',
};
function getRelLabel(type) { return REL_LABELS[type] || type; }

const INVERSE_REL = {
  parent: 'child', child: 'parent',
  grandparent: 'grandchild', grandchild: 'grandparent',
  uncle_aunt: 'nephew_niece', nephew_niece: 'uncle_aunt',
  step_parent: 'step_child', step_child: 'step_parent',
  half_sibling: 'half_sibling', step_sibling: 'step_sibling',
  adopted_parent: 'adopted_child', adopted_child: 'adopted_parent',
  godparent: 'godchild', godchild: 'godparent',
};

// ══════════════════════════════════════════════════════
// DATA SOURCE: Load from real audio test debug output
// ══════════════════════════════════════════════════════
const debugPath = path.join(__dirname, 'test-real-audio-debug.json');
const rawDebug = JSON.parse(fs.readFileSync(debugPath, 'utf8'));

// Placeholder biography generator
const PLACEHOLDER_BIO = (name, birthPlace, birthDate) => {
  const place = birthPlace || 'an unknown town';
  const year = birthDate ? new Date(birthDate).getFullYear() : 'an earlier time';
  return `${name} was born in ${place} in ${year}. From an early age, they showed a deep commitment to family and community. Their journey through life has been shaped by the relationships they built, the challenges they overcame, and the values they passed on to the next generation.\n\nThose who know ${name.split(' ')[0]} best describe them as someone whose presence brings warmth and stability to every gathering. Whether through small daily acts of kindness or larger moments of courage, they have left an indelible mark on everyone around them.\n\nTheir story continues to unfold, woven into the larger tapestry of the family — a testament to the power of love, resilience, and connection across generations.`;
};

// Transform real audio people into memory book format
const realPeople = rawDebug.finalPeople.map((p, i) => {
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');
  // Give biographies to the first 6 people, summaries to the next few
  let ai_biography = null;
  let ai_summary = null;
  if (i < 6) {
    ai_biography = PLACEHOLDER_BIO(fullName, p.birth_place, p.birth_date);
  } else if (i < 10) {
    ai_summary = `${fullName} is a valued member of the Bueso family. Their warmth and dedication to loved ones has been a constant throughout the years.`;
  }
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    birth_date: p.birth_date || null,
    birth_place: p.birth_place || null,
    current_location: p.current_location || null,
    death_date: p.death_date || null,
    avatar_url: SHARED_AVATAR_KEY,
    ai_biography,
    ai_summary,
  };
});

// Transform stories
const realStories = (rawDebug.finalStories || []).map((s, i) => ({
  id: `s${i + 1}`,
  title: s.title,
  content: s.content,
  event_date: s.event_date || null,
  event_location: s.event_location || null,
  ai_generated: true,
}));

// Transform interviews
const realInterviews = (rawDebug.interviews || []).map((iv, i) => ({
  id: iv.interviewId || `i${i + 1}`,
  title: iv.label || `Interview ${i + 1}`,
  ai_summary: iv.transcript || 'No summary available.',
  ai_key_topics: [],
  subject_person_id: rawDebug.finalPeople[0]?.id,
  created_at: new Date().toISOString(),
}));

// Filter to only verified or high-confidence relationships, limit to avoid clutter
const realRels = rawDebug.finalRelationships
  .filter(r => r.verified || r.confidence >= 0.7)
  .map(r => ({
    person_a_id: r.person_a_id,
    person_b_id: r.person_b_id,
    relationship_type: r.relationship_type,
    family_group_id: 'fg1',
    verified: r.verified || false,
  }));

const MOCK = {
  familyGroup: {
    name: 'The Bueso Family',
    description: 'A vibrant family spanning generations and continents, from Puerto Rico to Mexico City and beyond. The Bueso family story is one of adventure, connection, and the enduring bonds that tie loved ones together across borders and through time.',
  },
  people: realPeople,
  relationships: realRels,
  stories: realStories,
  interviews: realInterviews,
  storyPeople: [],
  profileName: 'Carlos',
  selfPersonId: rawDebug.finalPeople[0]?.id || 'person-narrator-carlos',
  language: 'en',
};

// ══════════════════════════════════════════════════════
// PDF GENERATION (mirrors edge function exactly)
// ══════════════════════════════════════════════════════
async function generateMemoryBookPDF(data) {
  const pdf = await PDFDocument.create();

  const [regular, bold, italic, boldItalic, sans, sansBold] = await Promise.all([
    pdf.embedFont(StandardFonts.TimesRoman),
    pdf.embedFont(StandardFonts.TimesRomanBold),
    pdf.embedFont(StandardFonts.TimesRomanItalic),
    pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const fonts = { regular, bold, italic, boldItalic, sans, sansBold };

  // ── Fetch images from DigitalOcean Spaces ──
  const MAX_IMAGE_BYTES = 500_000;
  let logotypeImage = null;
  let matraLogotype = null;
  let matraCreamLogotype = null;
  let chairIconImage = null;
  const avatarImages = {};

  try {
    console.log('Fetching images from DigitalOcean Spaces...');
    const [logotypeUrl, matraLogoUrl, matraCreamUrl, chairIconUrl] = await Promise.all([
      getPresignedUrl(LOGOTYPE_KEY),
      getPresignedUrl(MATRA_LOGOTYPE_KEY),
      getPresignedUrl(MATRA_CREAM_KEY),
      getPresignedUrl(CHAIR_ICON_KEY),
    ]);
    const [logotypeResp, matraLogoResp, matraCreamResp, chairIconResp] = await Promise.all([
      fetch(logotypeUrl),
      fetch(matraLogoUrl),
      fetch(matraCreamUrl),
      fetch(chairIconUrl),
    ]);
    const [logotypeBytes, matraLogoBytes, matraCreamBytes, chairIconBytes] = await Promise.all([
      logotypeResp.ok ? logotypeResp.arrayBuffer() : null,
      matraLogoResp.ok ? matraLogoResp.arrayBuffer() : null,
      matraCreamResp.ok ? matraCreamResp.arrayBuffer() : null,
      chairIconResp.ok ? chairIconResp.arrayBuffer() : null,
    ]);
    if (logotypeBytes && logotypeBytes.byteLength <= MAX_IMAGE_BYTES) {
      try {
        logotypeImage = await pdf.embedPng(new Uint8Array(logotypeBytes));
      } catch {
        logotypeImage = await pdf.embedJpg(new Uint8Array(logotypeBytes));
      }
      console.log(`Logotype loaded (${(logotypeBytes.byteLength / 1024).toFixed(0)}KB)`);
    } else {
      console.warn('Logotype NOT loaded — resp ok:', logotypeResp.ok, 'size:', logotypeBytes?.byteLength);
    }
    if (matraLogoBytes && matraLogoBytes.byteLength <= MAX_IMAGE_BYTES) {
      try {
        matraLogotype = await pdf.embedPng(new Uint8Array(matraLogoBytes));
      } catch {
        matraLogotype = await pdf.embedJpg(new Uint8Array(matraLogoBytes));
      }
      console.log(`Matra logotype loaded (${(matraLogoBytes.byteLength / 1024).toFixed(0)}KB)`);
    }
    if (matraCreamBytes && matraCreamBytes.byteLength <= MAX_IMAGE_BYTES) {
      try {
        matraCreamLogotype = await pdf.embedPng(new Uint8Array(matraCreamBytes));
      } catch {
        matraCreamLogotype = await pdf.embedJpg(new Uint8Array(matraCreamBytes));
      }
      console.log(`Matra cream logotype loaded (${(matraCreamBytes.byteLength / 1024).toFixed(0)}KB)`);
    }
    if (chairIconBytes && chairIconBytes.byteLength <= MAX_IMAGE_BYTES) {
      try {
        chairIconImage = await pdf.embedPng(new Uint8Array(chairIconBytes));
      } catch {
        chairIconImage = await pdf.embedJpg(new Uint8Array(chairIconBytes));
      }
      console.log(`Chair icon loaded (${(chairIconBytes.byteLength / 1024).toFixed(0)}KB)`);
    }
  } catch (e) { console.warn('Brand image fetch skipped:', e.message); }

  // Fetch the shared avatar once, reuse for all people
  const avatarPeople = data.people.filter(p => p.avatar_url);
  if (avatarPeople.length > 0) {
    try {
      const avatarUrl = await getPresignedUrl(SHARED_AVATAR_KEY);
      const resp = await fetch(avatarUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength <= MAX_IMAGE_BYTES) {
          const sharedAvatar = SHARED_AVATAR_KEY.endsWith('.png')
            ? await pdf.embedPng(new Uint8Array(buf))
            : await pdf.embedJpg(new Uint8Array(buf));
          for (const p of avatarPeople) {
            avatarImages[p.id] = sharedAvatar;
          }
          console.log(`Avatar loaded (${(buf.byteLength / 1024).toFixed(0)}KB), mapped to ${avatarPeople.length} people`);
        }
      }
    } catch (e) { console.warn('Avatar fetch skipped:', e.message); }
  }

  const { pageWidth, pageHeight, margin } = BRAND;
  const contentWidth = pageWidth - margin * 2;
  const borderInset = 30;

  function sanitize(text) {
    return text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
  }

  function newPage() {
    const p = pdf.addPage([pageWidth, pageHeight]);
    p.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: BRAND.cream });
    return p;
  }

  function drawFooter(p, num) {
    p.drawLine({
      start: { x: margin, y: margin - 15 }, end: { x: pageWidth - margin, y: margin - 15 },
      thickness: 0.5, color: BRAND.gold,
    });
    const txt = `${num}`;
    p.drawText(txt, {
      x: (pageWidth - fonts.sans.widthOfTextAtSize(txt, 8)) / 2,
      y: margin - 28, size: 8, font: fonts.sans, color: BRAND.mutedText,
    });
  }

  function drawDivider(p, atY) {
    const centerX = pageWidth / 2;
    const armLen = 70;
    const dotGap = 6;
    p.drawLine({
      start: { x: centerX - armLen - dotGap, y: atY },
      end: { x: centerX - dotGap, y: atY },
      thickness: 0.5, color: BRAND.gold,
    });
    for (const dx of [-3, 0, 3]) {
      p.drawCircle({ x: centerX + dx * 2, y: atY, size: 1.2, color: BRAND.gold });
    }
    p.drawLine({
      start: { x: centerX + dotGap, y: atY },
      end: { x: centerX + armLen + dotGap, y: atY },
      thickness: 0.5, color: BRAND.gold,
    });
    return atY - 28;
  }

  function drawSectionHeader(p, title, atY) {
    p.drawText(title, { x: margin, y: atY - 6, size: 26, font: fonts.bold, color: BRAND.green });
    p.drawLine({
      start: { x: margin, y: atY - 14 }, end: { x: pageWidth - margin, y: atY - 14 },
      thickness: 0.5, color: BRAND.gold,
    });
    return atY - 40;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return sanitize(dateStr);
    if (data.language === 'es') {
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return `${d.getDate()} de ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const day = d.getDate();
    const suffix = (day === 1 || day === 21 || day === 31) ? 'st' : (day === 2 || day === 22) ? 'nd' : (day === 3 || day === 23) ? 'rd' : 'th';
    return `${months[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
  }

  function drawWrappedText(ctx, text, x, font, size, color, maxWidth, lineHeight, onPageBreak) {
    const lh = lineHeight || size * 1.5;
    const words = sanitize(text).split(' ');
    let line = '';
    let pg = ctx.page;
    let curY = ctx.y;

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
  const familyName = data.familyGroup?.name || `${data.profileName}'s Family`;

  // ═══════════════════════════════════════════
  // COVER PAGE
  // ═══════════════════════════════════════════
  const cover = pdf.addPage([pageWidth, pageHeight]);

  // ── Cream background ──
  cover.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: BRAND.cream });

  // ── Mountain ridgeline helpers ──
  const _sr = (v) => { const s = Math.sin(v * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
  const _vn = (x, seed, sc) => {
    const xi = Math.floor(x / sc), xf = (x / sc) - xi;
    const sm = xf * xf * (3 - 2 * xf);
    return _sr(xi + seed) + (_sr(xi + 1 + seed) - _sr(xi + seed)) * sm;
  };
  const mtnNoise = (x, seed, amp, pers, baseScale, oct) => {
    let v = 0, a = amp, sc = baseScale;
    for (let i = 0; i < oct; i++) { v += (_vn(x, seed + i * 1000, sc) * 2 - 1) * a; a *= pers; sc /= 2; }
    return v;
  };
  const _prof = (pts, x) => {
    const t = x / pageWidth;
    if (t <= pts[0][0]) return pts[0][1] * pageHeight;
    if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1] * pageHeight;
    for (let i = 0; i < pts.length - 1; i++) {
      if (t >= pts[i][0] && t <= pts[i + 1][0]) {
        const u = (t - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
        const s = u * u * (3 - 2 * u);
        return (pts[i][1] + (pts[i + 1][1] - pts[i][1]) * s) * pageHeight;
      }
    }
    return pts[pts.length - 1][1] * pageHeight;
  };

  // Gold mountain (back): peaks center-left, capped at 35%
  const goldPts = [
    [0.0, 0.03], [0.05, 0.08], [0.12, 0.15], [0.20, 0.22],
    [0.28, 0.28], [0.35, 0.32], [0.42, 0.35], [0.50, 0.33],
    [0.58, 0.28], [0.65, 0.22], [0.72, 0.17], [0.80, 0.12],
    [0.88, 0.08], [0.95, 0.05], [1.0, 0.04],
  ];
  // Green mountain (front): rises dramatically on right, rougher, capped at 50%
  const greenPts = [
    [0.0, 0.10], [0.08, 0.12], [0.15, 0.10], [0.22, 0.11],
    [0.30, 0.13], [0.38, 0.16], [0.45, 0.21], [0.52, 0.27],
    [0.58, 0.32], [0.65, 0.37], [0.72, 0.41], [0.80, 0.44],
    [0.88, 0.47], [0.95, 0.49], [1.0, 0.50],
  ];

  // Draw gold mountain (back layer)
  for (let x = 0; x < pageWidth; x += 1) {
    const h = Math.max(0, _prof(goldPts, x) + mtnNoise(x, 42, 14, 0.55, 55, 5));
    cover.drawRectangle({ x, y: 0, width: 1.5, height: h, color: BRAND.gold });
  }
  // Draw green mountain (front layer, more raspy)
  for (let x = 0; x < pageWidth; x += 1) {
    const h = Math.max(0, _prof(greenPts, x) + mtnNoise(x, 137, 22, 0.65, 45, 6));
    cover.drawRectangle({ x, y: 0, width: 1.5, height: h, color: BRAND.green });
  }

  // ── Logotype slightly above page center ──
  if (logotypeImage) {
    const ltDim = logotypeImage.scale(0.4);
    const ltW = Math.min(ltDim.width, 160);
    const ltH = ltW * (ltDim.height / ltDim.width);
    cover.drawImage(logotypeImage, {
      x: (pageWidth - ltW) / 2, y: (pageHeight - ltH) / 2 + 40,
      width: ltW, height: ltH,
    });
  }

  // ── Bottom text (on the mountain area, cream colored, bold) ──
  const safeFamilyName = sanitize(familyName);
  const btmSize = 10;
  // Left: Family name
  cover.drawText(safeFamilyName, {
    x: margin, y: 25,
    size: btmSize, font: fonts.sansBold, color: BRAND.cream,
  });
  // Right: "Memory Book by" + cream Matra image
  const mbByPrefix = 'Memory Book by ';
  const mbByPrefixW = fonts.sansBold.widthOfTextAtSize(mbByPrefix, btmSize);
  const matraCreamH = 10;
  const matraCreamW = matraCreamLogotype
    ? (matraCreamLogotype.width / matraCreamLogotype.height) * matraCreamH
    : 0;
  const mbTotalW = mbByPrefixW + matraCreamW;
  const mbByX = pageWidth - margin - mbTotalW;
  cover.drawText(mbByPrefix, {
    x: mbByX, y: 25,
    size: btmSize, font: fonts.sansBold, color: BRAND.cream,
  });
  if (matraCreamLogotype) {
    cover.drawImage(matraCreamLogotype, {
      x: mbByX + mbByPrefixW, y: 24,
      width: matraCreamW, height: matraCreamH,
    });
  }

  // ═══════════════════════════════════════════
  // TABLE OF CONTENTS
  // ═══════════════════════════════════════════
  pageNum++;
  const tocPage = newPage();
  let tocY = drawSectionHeader(tocPage, t('tableOfContents'), pageHeight - margin);

  const tocEntries = [t('ourFamily')];
  if (data.people.length > 0) tocEntries.push(t('familyMembers'));
  if (data.stories.length > 0) tocEntries.push(t('storiesAndMemories'));
  if (data.interviews.length > 0) tocEntries.push(t('conversations'));
  if (data.relationships.length > 0) tocEntries.push(t('familyConnections'));

  tocY -= 10;
  for (let i = 0; i < tocEntries.length; i++) {
    const entry = tocEntries[i];
    const chNum = `${i + 1}`;
    tocPage.drawText(chNum, {
      x: margin + 8 - fonts.sansBold.widthOfTextAtSize(chNum, 11) / 2,
      y: tocY, size: 11, font: fonts.sansBold, color: BRAND.gold,
    });
    const entryX = margin + 28;
    tocPage.drawText(entry, { x: entryX, y: tocY, size: 14, font: fonts.regular, color: BRAND.darkText });
    const leaderStartX = entryX + fonts.regular.widthOfTextAtSize(entry, 14) + 8;
    const leaderEndX = pageWidth - margin;
    for (let lx = leaderStartX; lx < leaderEndX - 4; lx += 6) {
      tocPage.drawCircle({ x: lx, y: tocY + 3, size: 0.5, color: BRAND.lightLine });
    }
    tocY -= 36;
  }
  drawFooter(tocPage, pageNum);

  // ═══════════════════════════════════════════
  // OUR FAMILY
  // ═══════════════════════════════════════════
  pageNum++;
  let page = newPage();
  let y = drawSectionHeader(page, t('ourFamily'), pageHeight - margin);

  if (data.familyGroup?.description) {
    page.drawLine({
      start: { x: margin + 8, y: y + 4 }, end: { x: margin + 8, y: y - 40 },
      thickness: 2, color: BRAND.gold,
    });
    const res = drawWrappedText(
      { page, y }, data.familyGroup.description, margin + 20,
      fonts.italic, 12, BRAND.mutedText, contentWidth - 20, undefined,
      (pg) => { drawFooter(pg, pageNum); pageNum++; }
    );
    page = res.page; y = res.y - 20;
  }

  const cardH = 90;
  const cardY = y - cardH;
  page.drawRectangle({ x: margin + 2, y: cardY - 2, width: contentWidth, height: cardH, color: BRAND.lightLine });
  page.drawRectangle({ x: margin, y: cardY, width: contentWidth, height: cardH, color: BRAND.white, borderColor: BRAND.gold, borderWidth: 1 });
  page.drawLine({ start: { x: margin, y: cardY + cardH }, end: { x: margin + contentWidth, y: cardY + cardH }, thickness: 2.5, color: BRAND.gold });

  const statItems = [
    { label: t('people'), value: `${data.people.length}` },
    { label: t('stories'), value: `${data.stories.length}` },
    { label: t('conversations'), value: `${data.interviews.length}` },
    { label: t('connections'), value: `${data.relationships.length}` },
  ];
  const statW = contentWidth / statItems.length;
  statItems.forEach((stat, i) => {
    const sx = margin + statW * i + statW / 2;
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

  // ── Chair icon in bottom-right corner ──
  if (chairIconImage) {
    const chairSize = 300;
    const chairDim = chairIconImage.scale(1);
    const chairW = chairSize;
    const chairH = chairSize * (chairDim.height / chairDim.width);
    page.drawImage(chairIconImage, {
      x: pageWidth - chairW - 10,
      y: 70,
      width: chairW,
      height: chairH,
    });
  }

  drawFooter(page, pageNum);

  // ═══════════════════════════════════════════
  // FAMILY MEMBERS
  // ═══════════════════════════════════════════
  if (data.people.length > 0) {
    pageNum++;
    page = newPage();
    y = drawSectionHeader(page, t('familyMembers'), pageHeight - margin);

    const AVATAR_SIZE = 150;
    const AVATAR_GAP = 20;
    const AVATAR_BORDER = 3;
    let personIndex = 0;

    for (const person of data.people) {
      const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ');
      const avatar = avatarImages[person.id] || null;
      const hasBio = !!(person.ai_biography || person.ai_summary);

      // Each person starts on enough space or a new page
      if (y < margin + 250) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      // Build details and relationships
      const details = [];
      if (person.birth_date) {
        details.push(person.death_date
          ? `${formatDate(person.birth_date)} - ${formatDate(person.death_date)}`
          : `${formatDate(person.birth_date)}`);
      }
      if (person.birth_place) details.push(person.birth_place);
      if (person.current_location) details.push(`${t('livesIn')} ${person.current_location}`);

      const personRels = data.relationships.filter(
        r => r.person_a_id === person.id || r.person_b_id === person.id
      );
      const relTexts = [];
      const seenOthers = new Set();
      for (const r of personRels) {
        const iAmA = r.person_a_id === person.id;
        const otherId = iAmA ? r.person_b_id : r.person_a_id;
        if (seenOthers.has(otherId)) continue;
        seenOthers.add(otherId);
        const other = data.people.find(p => p.id === otherId);
        const otherName = other ? [other.first_name, other.last_name].filter(Boolean).join(' ') : t('unknown');
        // When I'm person_a, the type describes MY role → invert to get other's role
        const displayType = iAmA ? (INVERSE_REL[r.relationship_type] || r.relationship_type) : r.relationship_type;
        relTexts.push(`${getRelLabel(displayType)}: ${otherName}`);
        if (relTexts.length >= 6) break;
      }

      if (hasBio && avatar) {
        // ── TWO-COLUMN LAYOUT (bio + avatar) ──
        const imageOnRight = personIndex % 2 === 1;
        personIndex++;
        const blockTopY = y;
        const imgX = imageOnRight ? margin + contentWidth - AVATAR_SIZE : margin;

        // Avatar column
        page.drawRectangle({
          x: imgX - AVATAR_BORDER, y: blockTopY - AVATAR_SIZE - AVATAR_BORDER,
          width: AVATAR_SIZE + AVATAR_BORDER * 2, height: AVATAR_SIZE + AVATAR_BORDER * 2,
          borderColor: BRAND.gold, borderWidth: 2,
        });
        page.drawImage(avatar, {
          x: imgX, y: blockTopY - AVATAR_SIZE, width: AVATAR_SIZE, height: AVATAR_SIZE,
        });

        let leftY = blockTopY - AVATAR_SIZE - AVATAR_BORDER - 20;

        // Detail tags below avatar
        for (const detail of details) {
          const detRes = drawWrappedText(
            { page, y: leftY }, detail, imgX,
            fonts.sans, 9, BRAND.mutedText, AVATAR_SIZE, 13,
            (pg) => { drawFooter(pg, pageNum); pageNum++; }
          );
          page = detRes.page; leftY = detRes.y;
        }

        // Relationship tags below avatar
        if (relTexts.length > 0) {
          leftY -= 4;
          for (const relLine of relTexts) {
            const relRes = drawWrappedText(
              { page, y: leftY }, relLine, imgX,
              fonts.sans, 8.5, BRAND.mutedText, AVATAR_SIZE, 12,
              (pg) => { drawFooter(pg, pageNum); pageNum++; }
            );
            page = relRes.page; leftY = relRes.y;
          }
        }

        // Text column: Name + Biography
        const textColX = imageOnRight ? margin : margin + AVATAR_SIZE + AVATAR_GAP;
        const textColWidth = contentWidth - AVATAR_SIZE - AVATAR_GAP;
        let rightY = blockTopY;

        page.drawText(sanitize(fullName), { x: textColX, y: rightY, size: 17, font: fonts.bold, color: BRAND.darkText });
        rightY -= 22;

        const bioText = person.ai_biography || person.ai_summary;
        const bioFont = person.ai_biography ? fonts.regular : fonts.italic;
        const bioColor = person.ai_biography ? BRAND.darkText : BRAND.mutedText;

        const bioRes = drawWrappedText(
          { page, y: rightY }, bioText, textColX, bioFont, 10.5, bioColor, textColWidth, 15,
          (pg) => { drawFooter(pg, pageNum); pageNum++; }
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
            (pg) => { drawFooter(pg, pageNum); pageNum++; }
          );
          page = detailRes.page; ty = detailRes.y;
        }

        if (relTexts.length > 0) {
          ty -= 4;
          const relResult = drawWrappedText(
            { page, y: ty }, relTexts.join('  \u00b7  '), textX,
            fonts.sans, 8.5, BRAND.mutedText, textWidth, 13,
            (pg) => { drawFooter(pg, pageNum); pageNum++; }
          );
          page = relResult.page; ty = relResult.y;
        }

        const imgBottomY = blockTopY - AVATAR_SIZE - AVATAR_BORDER - 8;
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
    y = drawSectionHeader(page, t('storiesAndMemories'), pageHeight - margin);

    for (const story of data.stories) {
      if (y < margin + 120) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      page.drawText(sanitize(story.title || t('untitledStory')), { x: margin, y, size: 16, font: fonts.bold, color: BRAND.darkText });
      y -= 20;

      const meta = [];
      if (story.event_date) meta.push(formatDate(story.event_date));
      if (story.event_location) meta.push(story.event_location);
      const peoplInStory = data.storyPeople
        .filter(sp => sp.story_id === story.id)
        .map(sp => { const p = data.people.find(pp => pp.id === sp.person_id); return p?.first_name; })
        .filter(Boolean);
      if (peoplInStory.length > 0) meta.push(`${t('featuring')} ${peoplInStory.join(', ')}`);
      if (meta.length > 0) {
        page.drawText(sanitize(meta.join('  ·  ')), { x: margin, y, size: 9.5, font: fonts.sans, color: BRAND.gold });
        y -= 18;
      }

      if (story.content) {
        const res = drawWrappedText({ page, y }, story.content, margin, fonts.regular, 10.5, BRAND.darkText, contentWidth, 15,
          (pg) => { drawFooter(pg, pageNum); pageNum++; }
        );
        page = res.page; y = res.y;
      }

      if (story.ai_generated) {
        y -= 5;
        page.drawText(t('aiCrafted'), { x: margin, y, size: 7.5, font: fonts.italic, color: BRAND.mutedText });
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
    y = drawSectionHeader(page, t('conversations'), pageHeight - margin);

    for (const interview of data.interviews) {
      if (y < margin + 120) {
        drawFooter(page, pageNum);
        pageNum++;
        page = newPage();
        y = pageHeight - margin;
      }

      page.drawText(sanitize(interview.title || t('untitledConversation')), {
        x: margin, y, size: 15, font: fonts.bold, color: BRAND.darkText,
      });
      y -= 20;

      const convDateObj = new Date(interview.created_at);
      const convDate = formatDate(convDateObj.toISOString().split('T')[0]);
      page.drawText(convDate, { x: margin, y, size: 9.5, font: fonts.sans, color: BRAND.mutedText });

      if (interview.subject_person_id) {
        const subject = data.people.find(p => p.id === interview.subject_person_id);
        if (subject) {
          const subName = [subject.first_name, subject.last_name].filter(Boolean).join(' ');
          const dateW = fonts.sans.widthOfTextAtSize(convDate, 9.5);
          page.drawText(sanitize(`  ·  ${subName}`), {
            x: margin + dateW, y, size: 9.5, font: fonts.sans, color: BRAND.gold,
          });
        }
      }
      y -= 18;

      if (interview.ai_key_topics?.length > 0) {
        const topics = interview.ai_key_topics.slice(0, 8);
        let topicX = margin;
        for (const topic of topics) {
          const topicText = sanitize(topic);
          const tw = fonts.sans.widthOfTextAtSize(topicText, 8) + 12;
          if (topicX + tw > pageWidth - margin) {
            topicX = margin;
            y -= 18;
          }
          page.drawRectangle({
            x: topicX, y: y - 4, width: tw, height: 15,
            color: BRAND.white, borderColor: BRAND.gold, borderWidth: 0.5,
          });
          page.drawText(topicText, {
            x: topicX + 6, y: y, size: 8, font: fonts.sans, color: BRAND.gold,
          });
          topicX += tw + 6;
        }
        y -= 22;
      }

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
    y = drawSectionHeader(page, t('familyConnections'), pageHeight - margin);

    // ── Build adjacency maps ──
    const childrenOf = new Map();
    const parentOf = new Map();
    const spouseOf = new Map();
    const siblingOf = new Map();

    for (const rel of data.relationships) {
      const { person_a_id: a, person_b_id: b, relationship_type: type } = rel;
      if (type === 'parent') {
        if (!childrenOf.has(a)) childrenOf.set(a, []);
        childrenOf.get(a).push(b);
        if (!parentOf.has(b)) parentOf.set(b, []);
        parentOf.get(b).push(a);
      } else if (type === 'spouse' || type === 'ex_spouse') {
        if (!spouseOf.has(a)) spouseOf.set(a, new Set());
        if (!spouseOf.has(b)) spouseOf.set(b, new Set());
        spouseOf.get(a).add(b);
        spouseOf.get(b).add(a);
      } else if (type === 'step_parent') {
        if (!childrenOf.has(a)) childrenOf.set(a, []);
        childrenOf.get(a).push(b);
        if (!parentOf.has(b)) parentOf.set(b, []);
        parentOf.get(b).push(a);
      } else if (type === 'step_child') {
        if (!childrenOf.has(b)) childrenOf.set(b, []);
        childrenOf.get(b).push(a);
        if (!parentOf.has(a)) parentOf.set(a, []);
        parentOf.get(a).push(b);
      } else if (type === 'sibling' || type === 'half_sibling' || type === 'step_sibling') {
        if (!siblingOf.has(a)) siblingOf.set(a, new Set());
        if (!siblingOf.has(b)) siblingOf.set(b, new Set());
        siblingOf.get(a).add(b);
        siblingOf.get(b).add(a);
      }
    }

    // ── BFS from self person (the app user) ──
    const selfId = data.selfPersonId || data.people[0]?.id;
    const generation = new Map();
    const peopleById = new Map(data.people.map(p => [p.id, p]));

    generation.set(selfId, 0);
    const queue = [selfId];
    while (queue.length > 0) {
      const pid = queue.shift();
      const gen = generation.get(pid);
      for (const sid of (spouseOf.get(pid) || [])) {
        if (!generation.has(sid)) { generation.set(sid, gen); queue.push(sid); }
      }
      for (const cid of (childrenOf.get(pid) || [])) {
        if (!generation.has(cid)) { generation.set(cid, gen + 1); queue.push(cid); }
      }
      for (const ppid of (parentOf.get(pid) || [])) {
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
    const genGroups = new Map();
    for (const [pid, gen] of generation) {
      if (!genGroups.has(gen)) genGroups.set(gen, []);
      genGroups.get(gen).push(pid);
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

    const V_SPACING = Math.min(110, availH / Math.max(sortedGens.length, 1));

    const positions = new Map();
    for (let gi = 0; gi < sortedGens.length; gi++) {
      const gen = sortedGens[gi];
      const members = genGroups.get(gen);

      // Sort: self person centered, couples together
      const sorted = [];
      const placed = new Set();
      // Place self person first in their generation
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

      const posY = graphTopY - gi * V_SPACING;
      if (sorted.length === 1) {
        positions.set(sorted[0], { x: graphCenterX, y: posY });
        continue;
      }

      // Measure label widths to prevent overlap
      const labelWidths = sorted.map(pid => {
        const p = peopleById.get(pid);
        const name = sanitize(p?.first_name || '');
        return Math.max(fonts.sansBold.widthOfTextAtSize(name, 8.5), NODE_RADIUS * 2);
      });

      // Compute minimum gaps between adjacent nodes
      const minGaps = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        minGaps.push((labelWidths[i] + labelWidths[i + 1]) / 2 + 8);
      }
      const totalMinWidth = minGaps.reduce((a, b) => a + b, 0);

      // Scale down if row is too wide for available space
      const scale = totalMinWidth > availW ? availW / totalMinWidth : 1;
      const totalWidth = totalMinWidth * scale;

      // Center the row and place nodes
      let curX = graphCenterX - totalWidth / 2;
      for (let xi = 0; xi < sorted.length; xi++) {
        const clampedX = Math.max(graphLeftX, Math.min(graphRightX, curX));
        positions.set(sorted[xi], { x: clampedX, y: posY });
        if (xi < sorted.length - 1) curX += minGaps[xi] * scale;
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
    const relToSelf = new Map();
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
    const drawnSpouses = new Set();
    for (const rel of data.relationships) {
      if (rel.relationship_type !== 'spouse' && rel.relationship_type !== 'ex_spouse') continue;
      const key = [rel.person_a_id, rel.person_b_id].sort().join('-');
      if (drawnSpouses.has(key)) continue;
      drawnSpouses.add(key);
      const posA = positions.get(rel.person_a_id);
      const posB = positions.get(rel.person_b_id);
      if (!posA || !posB) continue;
      const isDashed = rel.relationship_type === 'ex_spouse';
      // Connect edge-to-edge of circles
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

    const drawnParentChild = new Set();
    for (const rel of data.relationships) {
      if (rel.relationship_type !== 'parent') continue;
      const key = `${rel.person_a_id}-${rel.person_b_id}`;
      if (drawnParentChild.has(key)) continue;
      drawnParentChild.add(key);
      const parentPos = positions.get(rel.person_a_id);
      const childPos = positions.get(rel.person_b_id);
      if (!parentPos || !childPos) continue;
      // Connect bottom of parent node to top of child label area
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

    const drawnSiblings = new Set();
    for (const rel of data.relationships) {
      if (rel.relationship_type !== 'sibling' && rel.relationship_type !== 'half_sibling') continue;
      const key = [rel.person_a_id, rel.person_b_id].sort().join('-');
      if (drawnSiblings.has(key)) continue;
      drawnSiblings.add(key);
      const posA = positions.get(rel.person_a_id);
      const posB = positions.get(rel.person_b_id);
      if (!posA || !posB) continue;
      // Connect edge-to-edge horizontally below nodes
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

      // Node glow
      page.drawCircle({ x: pos.x, y: pos.y, size: NODE_RADIUS + 4, color: isSelf ? BRAND.gold : BRAND.lightLine });

      // Node circle
      page.drawCircle({
        x: pos.x, y: pos.y, size: NODE_RADIUS,
        color: BRAND.green, borderColor: isSelf ? BRAND.gold : BRAND.lightLine, borderWidth: isSelf ? 2.5 : 1.5,
      });

      // Avatar inside circle
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

      // Name label below node
      const firstName = sanitize(person.first_name || '');
      const fnW = fonts.sansBold.widthOfTextAtSize(firstName, 8.5);
      page.drawText(firstName, {
        x: pos.x - fnW / 2, y: pos.y - NODE_RADIUS - LABEL_OFFSET,
        size: 8.5, font: fonts.sansBold, color: BRAND.darkText,
      });

      // Relationship tag to self (below name)
      if (!isSelf) {
        const relType = relToSelf.get(person.id);
        if (relType) {
          const relTag = sanitize(getRelLabel(relType));
          const rtW = fonts.sans.widthOfTextAtSize(relTag, 7);
          page.drawText(relTag, {
            x: pos.x - rtW / 2, y: pos.y - NODE_RADIUS - LABEL_OFFSET - 11,
            size: 7, font: fonts.sans, color: BRAND.gold,
          });
        }
      } else {
        const meLabel = 'Me';
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

  if (logotypeImage) {
    const ltDim = logotypeImage.scale(0.45);
    const ltW = Math.min(ltDim.width, 300);
    const ltH = ltW * (ltDim.height / ltDim.width);
    back.drawImage(logotypeImage, {
      x: (pageWidth - ltW) / 2, y: pageHeight / 2 + 10, width: ltW, height: ltH,
    });
  }

  const tagline = t('tagline');
  back.drawText(tagline, {
    x: (pageWidth - fonts.italic.widthOfTextAtSize(tagline, 13)) / 2,
    y: pageHeight / 2 - 30, size: 13, font: fonts.italic, color: BRAND.darkText,
  });

  const genText = `${t('generatedOn')} ${dateText}`;
  back.drawText(genText, {
    x: (pageWidth - fonts.sans.widthOfTextAtSize(genText, 8)) / 2,
    y: 40, size: 8, font: fonts.sans, color: BRAND.mutedText,
  });

  pdf.setTitle(`${familyName} - Memory Book`);
  pdf.setAuthor('Matra');
  pdf.setSubject('Family Memory Book');
  pdf.setCreator('Matra — A living tree of your ancestry');
  pdf.setCreationDate(new Date());

  return pdf.save();
}

// ══════════════════════════════════════════════════════
// RUN
// ══════════════════════════════════════════════════════
console.log('Generating memory book preview...');
const startTime = Date.now();

const pdfBytes = await generateMemoryBookPDF(MOCK);
fs.writeFileSync(OUTPUT, pdfBytes);

const elapsed = Date.now() - startTime;
const sizeMB = (pdfBytes.length / 1024 / 1024).toFixed(2);
console.log(`Done! ${sizeMB} MB, ${elapsed}ms`);
console.log(`Output: ${OUTPUT}`);

// Auto-open on Windows
import { exec } from 'child_process';
exec(`start "" "${OUTPUT}"`);

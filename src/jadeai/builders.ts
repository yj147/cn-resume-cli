import { esc, buildExportThemeCSS, DEFAULT_THEME, type ResumeWithSections } from './utils.js';
import { BACKGROUND_TEMPLATES } from './constants.js';
import { generateQrSvg } from './qrcode.js';
import { buildRenderTree } from '../layout-core/render-tree.js';
import { buildClassicHtml } from './templates/classic.js';
import { buildModernHtml } from './templates/modern.js';
import { buildMinimalHtml } from './templates/minimal.js';
import { buildProfessionalHtml } from './templates/professional.js';
import { buildTwoColumnHtml } from './templates/two-column.js';
import { buildCreativeHtml } from './templates/creative.js';
import { buildAtsHtml } from './templates/ats.js';
import { buildAcademicHtml } from './templates/academic.js';
import { buildElegantHtml } from './templates/elegant.js';
import { buildExecutiveHtml } from './templates/executive.js';
import { buildDeveloperHtml } from './templates/developer.js';
import { buildDesignerHtml } from './templates/designer.js';
import { buildStartupHtml } from './templates/startup.js';
import { buildFormalHtml } from './templates/formal.js';
import { buildInfographicHtml } from './templates/infographic.js';
import { buildCompactHtml } from './templates/compact.js';
import { buildEuroHtml } from './templates/euro.js';
import { buildCleanHtml } from './templates/clean.js';
import { buildBoldHtml } from './templates/bold.js';
import { buildTimelineHtml } from './templates/timeline.js';
// Batch 1
import { buildNordicHtml } from './templates/nordic.js';
import { buildCorporateHtml } from './templates/corporate.js';
import { buildConsultantHtml } from './templates/consultant.js';
import { buildFinanceHtml } from './templates/finance.js';
import { buildMedicalHtml } from './templates/medical.js';
// Batch 2
import { buildGradientHtml } from './templates/gradient.js';
import { buildMetroHtml } from './templates/metro.js';
import { buildMaterialHtml } from './templates/material.js';
import { buildCoderHtml } from './templates/coder.js';
import { buildBlocksHtml } from './templates/blocks.js';
// Batch 3
import { buildMagazineHtml } from './templates/magazine.js';
import { buildArtisticHtml } from './templates/artistic.js';
import { buildRetroHtml } from './templates/retro.js';
import { buildNeonHtml } from './templates/neon.js';
import { buildWatercolorHtml } from './templates/watercolor.js';
// Batch 4
import { buildSwissHtml } from './templates/swiss.js';
import { buildJapaneseHtml } from './templates/japanese.js';
import { buildBerlinHtml } from './templates/berlin.js';
import { buildLuxeHtml } from './templates/luxe.js';
import { buildRoseHtml } from './templates/rose.js';
// Batch 5
import { buildArchitectHtml } from './templates/architect.js';
import { buildLegalHtml } from './templates/legal.js';
import { buildTeacherHtml } from './templates/teacher.js';
import { buildScientistHtml } from './templates/scientist.js';
import { buildEngineerHtml } from './templates/engineer.js';
// Batch 6
import { buildSidebarHtml } from './templates/sidebar.js';
import { buildCardHtml } from './templates/card.js';
import { buildZigzagHtml } from './templates/zigzag.js';
import { buildRibbonHtml } from './templates/ribbon.js';
import { buildMosaicHtml } from './templates/mosaic.js';

// Templates whose ENTIRE page is dark (not just header/sidebar).
// Body background must match so the PDF page doesn't show white gaps.
const FULL_DARK_TEMPLATES: Record<string, string> = {
  neon: '#111827',
};

// Templates with a dark sidebar — body uses a horizontal gradient so the
// sidebar colour fills every page edge-to-edge, even when the sidebar div
// has no more content on later pages.  @page margin is 0 so there are no
// white gaps between pages; text padding comes from the template's own p-*.
const SIDEBAR_DARK_TEMPLATES: Record<string, { bg: string; width: string }> = {
  'two-column': { bg: '#16213e', width: '35%' },
  sidebar:      { bg: '#1e40af', width: '35%' },
  coder:        { bg: '#0d1117', width: '32%' },
};

const TEMPLATE_BUILDERS: Record<string, (r: ResumeWithSections) => string> = {
  classic: buildClassicHtml,
  modern: buildModernHtml,
  minimal: buildMinimalHtml,
  professional: buildProfessionalHtml,
  'two-column': buildTwoColumnHtml,
  creative: buildCreativeHtml,
  ats: buildAtsHtml,
  academic: buildAcademicHtml,
  elegant: buildElegantHtml,
  executive: buildExecutiveHtml,
  developer: buildDeveloperHtml,
  designer: buildDesignerHtml,
  startup: buildStartupHtml,
  formal: buildFormalHtml,
  infographic: buildInfographicHtml,
  compact: buildCompactHtml,
  euro: buildEuroHtml,
  clean: buildCleanHtml,
  bold: buildBoldHtml,
  timeline: buildTimelineHtml,
  // Batch 1
  nordic: buildNordicHtml,
  corporate: buildCorporateHtml,
  consultant: buildConsultantHtml,
  finance: buildFinanceHtml,
  medical: buildMedicalHtml,
  // Batch 2
  gradient: buildGradientHtml,
  metro: buildMetroHtml,
  material: buildMaterialHtml,
  coder: buildCoderHtml,
  blocks: buildBlocksHtml,
  // Batch 3
  magazine: buildMagazineHtml,
  artistic: buildArtisticHtml,
  retro: buildRetroHtml,
  neon: buildNeonHtml,
  watercolor: buildWatercolorHtml,
  // Batch 4
  swiss: buildSwissHtml,
  japanese: buildJapaneseHtml,
  berlin: buildBerlinHtml,
  luxe: buildLuxeHtml,
  rose: buildRoseHtml,
  // Batch 5
  architect: buildArchitectHtml,
  legal: buildLegalHtml,
  teacher: buildTeacherHtml,
  scientist: buildScientistHtml,
  engineer: buildEngineerHtml,
  // Batch 6
  sidebar: buildSidebarHtml,
  card: buildCardHtml,
  zigzag: buildZigzagHtml,
  ribbon: buildRibbonHtml,
  mosaic: buildMosaicHtml,
};

function isValidQrUrl(str: string): boolean {
  if (!str?.trim()) return false;
  try {
    const raw = str.startsWith('http') ? str : `https://${str}`;
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname;
    return host === 'localhost' || /\.\w{2,}$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

/** Pre-generate QR code SVGs and attach to qr_codes section content
 *  so sync template builders can render them inline. */
async function preGenerateQrSvgs(resume: ResumeWithSections): Promise<void> {
  const qrSection = resume.sections.find((s: any) => s.type === 'qr_codes');
  if (!qrSection || qrSection.visible === false) return;
  const items = ((qrSection.content as any).items || []).filter((q: any) => isValidQrUrl(q.url));
  if (items.length === 0) return;
  const svgs: Record<string, string> = {};
  for (const qr of items) {
    try { svgs[qr.id] = await generateQrSvg(qr.url, 80); } catch { /* skip */ }
  }
  (qrSection.content as any)._qrSvgs = svgs;
}

function renderTreeToResume(renderTree, input): ResumeWithSections {
  const now = new Date();
  const sections = [
    ...(renderTree?.regions?.sidebar?.sections || []),
    ...(renderTree?.regions?.main?.sections || [])
  ]
    .slice()
    .sort((left, right) => Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0))
    .map((section) => ({
      id: section.id,
      resumeId: String(input?.document?.id || "resume"),
      type: section.sectionType,
      title: section.title?.text || section.sectionType,
      sortOrder: Number(section.sortOrder || 0),
      visible: true,
      content: section.body?.children?.[0]?.content || {},
      createdAt: now,
      updatedAt: now
    }));
  return {
    id: String(input?.document?.id || "resume"),
    userId: "cli",
    title: String(input?.title || "resume"),
    template: String(input?.templateSpec?.name || "classic"),
    themeConfig: input?.themeConfig || DEFAULT_THEME,
    isDefault: false,
    language: String(input?.language || "zh"),
    sections,
    createdAt: now,
    updatedAt: now
  };
}

export async function generateHtml(input, forPdf = false): Promise<string> {
  const renderTree = buildRenderTree(input);
  const resume = renderTreeToResume(renderTree, input);
  // Pre-generate QR SVGs so sync template builders can use them
  await preGenerateQrSvgs(resume);
  const builder = TEMPLATE_BUILDERS[resume.template] || buildClassicHtml;
  const bodyHtml = builder(resume);
  const theme = { ...DEFAULT_THEME, ...((resume as any).themeConfig || {}) };
  const themeCSS = buildExportThemeCSS(theme, resume.template);
  const isBackground = BACKGROUND_TEMPLATES.has(resume.template);

  const fullDarkBg = FULL_DARK_TEMPLATES[resume.template];
  const isFullDark = !!fullDarkBg;
  const sidebarDark = SIDEBAR_DARK_TEMPLATES[resume.template];
  const isSidebarDark = !!sidebarDark;

  // Determine body background for PDF
  let bodyBg = 'white';
  if (isFullDark) bodyBg = fullDarkBg;
  else if (isSidebarDark) bodyBg = `linear-gradient(90deg, ${sidebarDark.bg} ${sidebarDark.width}, white ${sidebarDark.width})`;

  // Convert theme margin (px) → mm for @page (approx 1mm ≈ 3.78px at 96dpi)
  const pxToMm = (px: number) => Math.round((px / 3.78) * 10) / 10;
  const pageMarginTop = pxToMm(theme.margin.top);
  const pageMarginBottom = pxToMm(theme.margin.bottom);

  const pdfOverrides = forPdf
    ? `/* Page margins */
       ${isFullDark || isSidebarDark
         ? `@page { margin: 0; }`
         : isBackground
           ? `@page { margin: ${pageMarginTop}mm 0 ${pageMarginBottom}mm 0; } @page :first { margin: 0; }`
           : `@page { margin: ${pageMarginTop}mm 0 ${pageMarginBottom}mm 0; }`}
       html, body { background: ${bodyBg} !important; padding: 0 !important; margin: 0 !important; display: block !important; min-height: 100%; }
       .resume-export { width: 100%; }
       .resume-export > div { box-shadow: none !important; ${isSidebarDark ? 'min-height: auto !important; max-width: none !important; width: 100% !important; background: transparent !important; overflow: visible !important;' : isBackground ? 'max-width: none !important; width: 100% !important;' : 'background: white !important;'} }
       /* Smart pagination: allow sections to break across pages, keep individual items together */
       [data-section] { break-inside: auto; }
       .item, [data-section] > div > div { break-inside: avoid; }
       .rounded-lg, .border-l-2 { break-inside: avoid; }
       h2, h3 { break-after: avoid; }
       p { orphans: 3; widows: 3; }
       ${isSidebarDark ? `/* Sidebar dark: body gradient = sidebar colour every page.
          Both flex children get clone so text has consistent padding at page breaks. */
       .resume-export > div > div {
         -webkit-box-decoration-break: clone;
         box-decoration-break: clone;
         padding-top: 10mm !important;
         padding-bottom: 10mm !important;
       }
       .resume-export > div > div:first-child {
         background: transparent !important;
         background-image: none !important;
       }
       .resume-export > div > div:last-child {
         background-color: white !important;
       }` : ''}
       ${isFullDark ? `/* Full-dark: simulate @page margin via content padding */
       .resume-export > div > *:last-child {
         padding: 12mm 10mm !important;
         -webkit-box-decoration-break: clone;
         box-decoration-break: clone;
       }` : ''}`
    : '';

  return `<!DOCTYPE html>
<html lang="${esc(resume.language || 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(resume.title)}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; display: flex; justify-content: center; padding: 40px 20px; background: #f4f4f5; min-height: 100vh; }
    @media print { body { padding: 0 !important; background: white !important; } .resume-export > div { box-shadow: none !important; } }
    ${themeCSS}
    ${pdfOverrides}
    /* Avatar style: oneInch → portrait rectangle (5:7) with small radius */
    .resume-export[data-avatar-style="oneInch"] img[class*="object-cover"] {
      border-radius: 4px !important;
      aspect-ratio: 5 / 7 !important;
      height: auto !important;
    }
    .resume-export[data-avatar-style="oneInch"] div:has(> img[class*="object-cover"]) {
      border-radius: 4px !important;
      height: auto !important;
    }
  </style>
</head>
<body>
  <div class="resume-export" data-avatar-style="${esc((resume as any).themeConfig?.avatarStyle || 'oneInch')}">
    ${bodyHtml}
  </div>
</body>
</html>`;
}

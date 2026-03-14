import { esc, buildExportThemeCSS, DEFAULT_THEME, type ResumeWithSections } from './utils.js';
import { BACKGROUND_TEMPLATES } from './constants.js';
import { generateQrSvg } from './qrcode.js';
import { buildRenderTree } from '../layout-core/render-tree.js';
import { buildCleanHtml as buildSingleCleanHtml } from './templates/single-clean.js';
import { buildFormalHtml as buildSingleFormalHtml } from './templates/single-formal.js';
import { buildMinimalHtml as buildSingleMinimalHtml } from './templates/single-minimal.js';
import { buildModernHtml as buildSingleAccentHtml } from './templates/single-accent.js';
import { buildAtsHtml as buildSingleAtsHtml } from './templates/single-ats.js';
import { buildTwoColumnHtml as buildSplitCleanHtml } from './templates/split-clean.js';
import { buildSplitFormalHtml } from './templates/split-formal.js';
import { buildCoderHtml as buildSplitDarkHtml } from './templates/split-dark.js';
import { buildSplitAtsHtml } from './templates/split-ats.js';
import { buildSidebarHtml as buildSidebarCleanHtml } from './templates/sidebar-clean.js';
import { buildSidebarDarkHtml } from './templates/sidebar-dark.js';
import { buildCompactHtml as buildCompactCleanHtml } from './templates/compact-clean.js';
import { buildCompactAtsHtml } from './templates/compact-ats.js';
import { buildTimelineHtml as buildTimelineCleanHtml } from './templates/timeline-clean.js';
import { buildTimelineAccentHtml } from './templates/timeline-accent.js';
import { buildMagazineHtml as buildEditorialAccentHtml } from './templates/editorial-accent.js';

// Templates whose ENTIRE page is dark (not just header/sidebar).
// Body background must match so the PDF page doesn't show white gaps.
const FULL_DARK_TEMPLATES: Record<string, string> = {};

// Templates with a dark sidebar — body uses a horizontal gradient so the
// sidebar colour fills every page edge-to-edge, even when the sidebar div
// has no more content on later pages.  @page margin is 0 so there are no
// white gaps between pages; text padding comes from the template's own p-*.
const SIDEBAR_DARK_TEMPLATES: Record<string, { bg: string; width: string }> = {
  'sidebar-dark': { bg: '#1e40af', width: '35%' },
  'split-dark': { bg: '#0d1117', width: '32%' },
};

export const TEMPLATE_BUILDERS: Record<string, (r: ResumeWithSections) => string> = {
  'single-clean': buildSingleCleanHtml,
  'single-formal': buildSingleFormalHtml,
  'single-minimal': buildSingleMinimalHtml,
  'single-accent': buildSingleAccentHtml,
  'single-ats': buildSingleAtsHtml,
  'split-clean': buildSplitCleanHtml,
  'split-formal': buildSplitFormalHtml,
  'split-dark': buildSplitDarkHtml,
  'split-ats': buildSplitAtsHtml,
  'sidebar-clean': buildSidebarCleanHtml,
  'sidebar-dark': buildSidebarDarkHtml,
  'compact-clean': buildCompactCleanHtml,
  'compact-ats': buildCompactAtsHtml,
  'timeline-clean': buildTimelineCleanHtml,
  'timeline-accent': buildTimelineAccentHtml,
  'editorial-accent': buildEditorialAccentHtml,
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
      content: structuredClone(section.payload || section.body?.children?.[0]?.content || {}),
      createdAt: now,
      updatedAt: now
    }));
  return {
    id: String(input?.document?.id || "resume"),
    userId: "cli",
    title: String(input?.title || "resume"),
    template: String(input?.templateSpec?.name || "single-clean"),
    themeConfig: input?.themeConfig || DEFAULT_THEME,
    isDefault: false,
    language: String(input?.language || "zh"),
    sections,
    createdAt: now,
    updatedAt: now
  };
}

export async function generateHtml(input, forPdf = false, renderTreeOverride = null): Promise<string> {
  const renderTree =
    renderTreeOverride && typeof renderTreeOverride === "object"
      ? renderTreeOverride
      : buildRenderTree(input);
  const resume = renderTreeToResume(renderTree, input);
  // Pre-generate QR SVGs so sync template builders can use them
  await preGenerateQrSvgs(resume);
  const builder = TEMPLATE_BUILDERS[resume.template] || TEMPLATE_BUILDERS["single-clean"];
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

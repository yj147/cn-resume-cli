const LIGHT = {
  layout: "single",
  bg: "#ffffff",
  text: "#111111",
  accent: "#2563eb",
  muted: "#4b5563",
  sidebarBg: "#f8fafc",
  sidebarText: "#0f172a"
};

const DARK = {
  layout: "single",
  bg: "#111827",
  text: "#f9fafb",
  accent: "#22d3ee",
  muted: "#cbd5e1",
  sidebarBg: "#1f2937",
  sidebarText: "#e5e7eb"
};

const TWO_COLUMN_DARK = {
  layout: "two-column",
  bg: "#ffffff",
  text: "#111111",
  accent: "#2563eb",
  muted: "#4b5563",
  sidebarBg: "#1e3a8a",
  sidebarText: "#f8fafc"
};

const TWO_COLUMN_CODER = {
  layout: "two-column",
  bg: "#ffffff",
  text: "#111111",
  accent: "#0ea5e9",
  muted: "#4b5563",
  sidebarBg: "#0f172a",
  sidebarText: "#e2e8f0"
};

const TEMPLATE_STYLE_REGISTRY = {
  classic: { ...LIGHT, accent: "#1f2937" },
  modern: { ...LIGHT, accent: "#0ea5e9" },
  minimal: { ...LIGHT, accent: "#6b7280" },
  professional: { ...LIGHT, accent: "#334155" },
  "two-column": TWO_COLUMN_DARK,
  creative: { ...LIGHT, accent: "#c026d3" },
  ats: { ...LIGHT, accent: "#111827" },
  academic: { ...LIGHT, accent: "#4338ca" },
  elegant: { ...LIGHT, accent: "#1d4ed8" },
  executive: { ...LIGHT, accent: "#0f172a" },
  developer: { ...LIGHT, accent: "#0284c7" },
  designer: { ...LIGHT, accent: "#db2777" },
  startup: { ...LIGHT, accent: "#16a34a" },
  formal: { ...LIGHT, accent: "#1f2937" },
  infographic: { ...LIGHT, accent: "#7c3aed" },
  compact: { ...LIGHT, accent: "#111827" },
  euro: { ...LIGHT, accent: "#1d4ed8" },
  clean: { ...LIGHT, accent: "#64748b" },
  bold: { ...LIGHT, accent: "#dc2626" },
  timeline: { ...LIGHT, accent: "#2563eb" },
  nordic: { ...LIGHT, accent: "#0ea5e9" },
  corporate: { ...LIGHT, accent: "#1f2937" },
  consultant: { ...LIGHT, accent: "#334155" },
  finance: { ...LIGHT, accent: "#0f766e" },
  medical: { ...LIGHT, accent: "#059669" },
  gradient: { ...LIGHT, accent: "#7c3aed" },
  metro: { ...LIGHT, accent: "#0369a1" },
  material: { ...LIGHT, accent: "#2563eb" },
  coder: TWO_COLUMN_CODER,
  blocks: { ...LIGHT, accent: "#ea580c" },
  magazine: { ...LIGHT, accent: "#be123c" },
  artistic: { ...LIGHT, accent: "#9333ea" },
  retro: { ...LIGHT, accent: "#b45309" },
  neon: DARK,
  watercolor: { ...LIGHT, accent: "#0891b2" },
  swiss: { ...LIGHT, accent: "#dc2626" },
  japanese: { ...LIGHT, accent: "#991b1b" },
  berlin: { ...LIGHT, accent: "#111827" },
  luxe: { ...LIGHT, accent: "#7c2d12" },
  rose: { ...LIGHT, accent: "#e11d48" },
  architect: { ...LIGHT, accent: "#374151" },
  legal: { ...LIGHT, accent: "#1e3a8a" },
  teacher: { ...LIGHT, accent: "#16a34a" },
  scientist: { ...LIGHT, accent: "#0e7490" },
  engineer: { ...LIGHT, accent: "#0369a1" },
  sidebar: TWO_COLUMN_DARK,
  card: { ...LIGHT, accent: "#0284c7" },
  zigzag: { ...LIGHT, accent: "#d946ef" },
  ribbon: { ...LIGHT, accent: "#ef4444" },
  mosaic: { ...LIGHT, accent: "#0ea5e9" }
} as const;

const DEFAULT_SECTION_ORDER = [
  "summary",
  "work_experience",
  "projects",
  "education",
  "skills",
  "custom",
  "certifications",
  "languages",
  "github",
  "qr_codes"
];

function layoutFamilyFor(style) {
  return style.layout === "two-column" ? "two-column" : "single-column";
}

function createTemplateSpec(name, visualTokens) {
  const layoutFamily = layoutFamilyFor(visualTokens);
  return {
    name,
    templateIntent: layoutFamily === "two-column" ? "structured-contrast" : "balanced-classic",
    layoutFamily,
    sectionRecipes: {
      order: DEFAULT_SECTION_ORDER,
      sidebar: layoutFamily === "two-column" ? ["skills", "languages", "certifications", "qr_codes"] : [],
      emphasis: layoutFamily === "two-column" ? "sidebar-primary" : "content-primary"
    },
    visualTokens,
    paginationPolicy: {
      mode: layoutFamily === "two-column" ? "balanced-columns" : "single-column-flow",
      preferSinglePage: true,
      allowOverflow: true
    },
    thumbnailRecipe: {
      variant: layoutFamily
    },
    templateOverrides: {}
  };
}

export const TEMPLATE_SPEC_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(TEMPLATE_STYLE_REGISTRY).map(([name, visualTokens]) => [name, createTemplateSpec(name, visualTokens)])
  )
);

export const BUILTIN_TEMPLATE_NAMES = Object.freeze(Object.keys(TEMPLATE_SPEC_REGISTRY));
export const BUILTIN_TEMPLATE_STYLES = Object.freeze(
  Object.fromEntries(BUILTIN_TEMPLATE_NAMES.map((name) => [name, TEMPLATE_SPEC_REGISTRY[name].visualTokens]))
);

export function resolveTemplateSpec(templateName) {
  const normalizedName = String(templateName || "").trim().toLowerCase();
  const spec = TEMPLATE_SPEC_REGISTRY[normalizedName];
  if (!spec) {
    throw new Error(`Unsupported template '${templateName}'. Use 'cn-resume template list'.`);
  }
  return spec;
}

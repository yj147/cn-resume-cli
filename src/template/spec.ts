const SINGLE = {
  layout: "single",
  bg: "#ffffff",
  text: "#111111",
  muted: "#4b5563",
  sidebarBg: "#f8fafc",
  sidebarText: "#0f172a"
};

const TWO_COLUMN = {
  layout: "two-column",
  bg: "#ffffff",
  text: "#111111",
  muted: "#4b5563",
  sidebarBg: "#1e3a8a",
  sidebarText: "#f8fafc"
};

const TWO_COLUMN_DARK = {
  layout: "two-column",
  bg: "#111827",
  text: "#f9fafb",
  muted: "#cbd5e1",
  sidebarBg: "#0f172a",
  sidebarText: "#e5e7eb"
};

const TEMPLATE_STYLE_REGISTRY = {
  "single-clean": { ...SINGLE, accent: "#2563eb" },
  "single-formal": { ...SINGLE, accent: "#1f2937" },
  "single-minimal": { ...SINGLE, accent: "#6b7280" },
  "single-accent": { ...SINGLE, accent: "#0ea5e9" },
  "single-ats": { ...SINGLE, accent: "#111827" },
  "split-clean": { ...TWO_COLUMN, accent: "#2563eb" },
  "split-formal": { ...TWO_COLUMN, accent: "#1f2937" },
  "split-dark": { ...TWO_COLUMN_DARK, accent: "#22d3ee" },
  "split-ats": { ...TWO_COLUMN, accent: "#111827" },
  "sidebar-clean": { ...TWO_COLUMN, accent: "#2563eb" },
  "sidebar-dark": { ...TWO_COLUMN_DARK, accent: "#22d3ee" },
  "compact-clean": { ...SINGLE, accent: "#2563eb" },
  "compact-ats": { ...SINGLE, accent: "#111827" },
  "timeline-clean": { ...SINGLE, accent: "#2563eb" },
  "timeline-accent": { ...SINGLE, accent: "#0ea5e9" },
  "editorial-accent": { ...SINGLE, accent: "#be123c" }
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
    templateIntent: layoutFamily === "two-column" ? "structured-contrast" : "balanced-default",
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

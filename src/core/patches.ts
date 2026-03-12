import { nowIso } from "./model.js";

export const RESUME_MODULES = {
  BASIC: "basic",
  EXPERIENCE: "experience",
  PROJECTS: "projects",
  EDUCATION: "education",
  SKILLS: "skills",
  CERTIFICATIONS: "certifications",
  LANGUAGES: "languages",
  GITHUB: "github",
  QR_CODES: "qr_codes",
  CUSTOM_SECTIONS: "custom_sections",
  RENDER_CONFIG: "render_config"
} as const;

export const PATCH_SEVERITIES = {
  INFO: "info",
  WARNING: "warning",
  BLOCKER: "blocker"
} as const;

export function createModulePatch({
  module,
  previousValue = null,
  nextValue = null,
  source = "",
  severity = PATCH_SEVERITIES.INFO,
  rollback = null,
  createdAt = nowIso()
}: {
  module: string;
  previousValue?: unknown;
  nextValue?: unknown;
  source: string;
  severity?: string;
  rollback: { strategy: string; target: string } | null;
  createdAt?: string;
}) {
  if (!module) {
    throw new Error("module patch requires module");
  }
  if (!source) {
    throw new Error("module patch requires source");
  }
  if (!rollback || !rollback.strategy || !rollback.target) {
    throw new Error("module patch requires rollback strategy and target");
  }
  return {
    module,
    previousValue,
    nextValue,
    source,
    severity,
    rollback,
    createdAt
  };
}

export function createResumeDraft({
  source = "",
  summary = "",
  patches = [],
  createdAt = nowIso()
}) {
  if (!source) {
    throw new Error("resume draft requires source");
  }
  return {
    draftId: `draft-${createdAt.replace(/[^\d]/g, "").slice(0, 14)}`,
    source,
    summary,
    patches,
    createdAt
  };
}

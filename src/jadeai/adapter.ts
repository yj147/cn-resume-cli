import { TEMPLATE_STYLES } from "../constants.js";
import { collectCustomSectionLines } from "../core/model.js";
import { getFieldValue } from "../core/provenance.js";
import { extractUrlsFromResume } from "./qrcode.js";
import type { Resume, ResumeSection, ThemeConfig } from "./types.js";

type BasicField = {
  value?: string;
};

type ResumeModel = {
  basic?: {
    name?: BasicField;
    title?: BasicField;
    email?: BasicField;
    phone?: BasicField;
    location?: BasicField;
    website?: BasicField;
    linkedin?: BasicField;
    github?: BasicField;
    summary?: BasicField;
  };
  experience?: Array<{
    company?: string;
    role?: string;
    start_date?: string;
    end_date?: string;
    start?: string;
    end?: string;
    bullets?: Array<{ text?: string; description?: string } | string>;
    technologies?: string[];
  }>;
  projects?: Array<{
    name?: string;
    role?: string;
    start_date?: string;
    end_date?: string;
    start?: string;
    end?: string;
    description?: string;
    bullets?: Array<{ text?: string; description?: string } | string>;
    technologies?: string[];
    url?: string;
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    major?: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    start?: string;
    end?: string;
    gpa?: string;
  }>;
  certifications?: Array<{
    name?: string;
    issuer?: string;
    date?: string;
    url?: string;
  }>;
  languages?: Array<{
    language?: string;
    proficiency?: string;
    description?: string;
  }>;
  github?: Array<{
    repo_url?: string;
    repoUrl?: string;
    name?: string;
    stars?: number;
    language?: string;
    description?: string;
  }>;
  qr_codes?: Array<{
    label?: string;
    name?: string;
    title?: string;
    url?: string;
  }>;
  skills?: Array<{
    category?: string;
    items?: Array<{ name?: string } | string>;
  }>;
  custom_sections?: Array<{
    title?: string;
    content?: string;
    items?: string[];
  }>;
  render_config?: {
    template?: string;
    modules?: string[];
    module_order?: string[];
    theme_color?: string;
    font_size?: string | number;
  };
};

export const SECTION_TITLE_BY_TYPE: Record<string, string> = {
  personal_info: "个人信息",
  summary: "个人简介",
  work_experience: "工作经历",
  projects: "项目经历",
  education: "教育背景",
  skills: "技能特长",
  certifications: "证书认证",
  languages: "语言能力",
  github: "GitHub 项目",
  custom: "附加信息",
  qr_codes: "二维码"
};

function isCurrent(end: string): boolean {
  return /至今|present|current/i.test(end);
}

function normalizeTheme(templateName: string, model?: ResumeModel): ThemeConfig {
  const style = (TEMPLATE_STYLES as Record<string, any>)[templateName] || (TEMPLATE_STYLES as Record<string, any>).elegant;
  const renderConfig = model?.render_config || {};
  const configuredFontSize = String(renderConfig.font_size || "").trim();
  return {
    primaryColor: style.text || "#1a1a1a",
    accentColor: renderConfig.theme_color || style.accent || "#2563eb",
    fontFamily: "Inter",
    fontSize: configuredFontSize || "medium",
    lineSpacing: 1.5,
    margin: { top: 20, right: 20, bottom: 20, left: 20 },
    sectionSpacing: 16,
    avatarStyle: "oneInch"
  };
}

function makeSection(
  resumeId: string,
  type: string,
  sortOrder: number,
  content: unknown,
  visible = true
): ResumeSection {
  const now = new Date();
  return {
    id: `sec-${sortOrder}`,
    resumeId,
    type,
    title: SECTION_TITLE_BY_TYPE[type] || type,
    sortOrder,
    visible,
    content: content as any,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeSkillItems(items: Array<{ name?: string } | string> = []): string[] {
  return items
    .map((entry) => (typeof entry === "string" ? entry : entry?.name || ""))
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

function normalizeList(input: Array<{ text?: string; description?: string } | string> = []): string[] {
  return input
    .map((entry) => (typeof entry === "string" ? entry : entry?.text || entry?.description || ""))
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function resolveStartDate(item: { start?: string; start_date?: string }): string {
  return String(item.start_date || item.start || "").trim();
}

function resolveEndDate(item: { end?: string; end_date?: string }): string {
  return String(item.end_date || item.end || "").trim();
}

export function normalizeSectionType(raw: string): string {
  const key = String(raw || "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    basic: "personal_info",
    personal: "personal_info",
    personal_info: "personal_info",
    summary: "summary",
    experience: "work_experience",
    work: "work_experience",
    work_experience: "work_experience",
    project: "projects",
    projects: "projects",
    education: "education",
    skills: "skills",
    custom: "custom",
    custom_sections: "custom",
    certifications: "certifications",
    languages: "languages",
    github: "github",
    qr: "qr_codes",
    qrcode: "qr_codes",
    qr_codes: "qr_codes"
  };
  return aliases[key] || key;
}

function applyRenderConfig(sections: ResumeSection[], renderConfig?: ResumeModel["render_config"]): ResumeSection[] {
  if (!renderConfig) {
    return sections;
  }
  const visibleModules = Array.isArray(renderConfig.modules)
    ? new Set(renderConfig.modules.map((item) => normalizeSectionType(item)))
    : null;
  const orderedTypes = Array.isArray(renderConfig.module_order)
    ? renderConfig.module_order.map((item) => normalizeSectionType(item))
    : [];

  if (visibleModules) {
    for (const section of sections) {
      if (section.type === "personal_info") {
        section.visible = true;
        continue;
      }
      section.visible = visibleModules.has(section.type);
    }
  }

  if (orderedTypes.length) {
    const explicitOrder = new Map<string, number>();
    orderedTypes.forEach((type, idx) => explicitOrder.set(type, idx));
    sections.sort((a, b) => {
      const orderA = explicitOrder.has(a.type) ? explicitOrder.get(a.type)! : Number.MAX_SAFE_INTEGER;
      const orderB = explicitOrder.has(b.type) ? explicitOrder.get(b.type)! : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.sortOrder - b.sortOrder;
    });
    sections.forEach((section, idx) => {
      section.sortOrder = idx + 1;
    });
  }
  return sections;
}

export function modelToJadeResume(model: ResumeModel, templateName: string): Resume {
  const resumeId = "cli-resume";
  const basic = model.basic || {};
  const basicName = getFieldValue(basic.name);
  const basicTitle = getFieldValue(basic.title);
  const basicEmail = getFieldValue(basic.email);
  const basicPhone = getFieldValue(basic.phone);
  const basicLocation = getFieldValue(basic.location);
  const basicWebsite = getFieldValue(basic.website);
  const basicLinkedin = getFieldValue(basic.linkedin);
  const basicGithub = getFieldValue(basic.github);
  const basicSummary = getFieldValue(basic.summary);
  const sections: ResumeSection[] = [];

  sections.push(
    makeSection(resumeId, "personal_info", 1, {
      fullName: basicName || "候选人",
      jobTitle: basicTitle || "",
      email: basicEmail || "",
      phone: basicPhone || "",
      location: basicLocation || "",
      website: basicWebsite || "",
      linkedin: basicLinkedin || "",
      github: basicGithub || "",
      customLinks: [],
      avatar: ""
    })
  );

  if (basicSummary) {
    sections.push(
      makeSection(resumeId, "summary", 2, {
        text: basicSummary
      })
    );
  }

  const experience = (model.experience || []).map((item, idx) => {
    const end = resolveEndDate(item);
    return {
      id: `work-${idx + 1}`,
      company: item.company || "",
      position: item.role || "",
      location: "",
      startDate: resolveStartDate(item),
      endDate: isCurrent(end) ? null : end,
      current: isCurrent(end),
      description: "",
      technologies: item.technologies || [],
      highlights: normalizeList(item.bullets || [])
    };
  });
  if (experience.length) {
    sections.push(makeSection(resumeId, "work_experience", 3, { items: experience }));
  }

  const projects = (model.projects || []).map((item, idx) => {
    const end = resolveEndDate(item);
    const highlights = normalizeList(item.bullets || []);
    const normalizedDescription = String(item.description || "").trim();
    return {
      id: `project-${idx + 1}`,
      name: item.name || "",
      url: item.url || "",
      startDate: resolveStartDate(item),
      endDate: isCurrent(end) ? "" : end,
      description: normalizedDescription,
      technologies: item.technologies || [],
      highlights: highlights.length ? highlights : normalizedDescription ? [normalizedDescription] : []
    };
  });
  if (projects.length) {
    sections.push(makeSection(resumeId, "projects", 4, { items: projects }));
  }

  const education = (model.education || []).map((item, idx) => ({
    id: `edu-${idx + 1}`,
    institution: item.school || "",
    degree: item.degree || "",
    field: item.major || "",
    location: "",
    startDate: resolveStartDate(item),
    endDate: resolveEndDate(item),
    gpa: item.gpa || "",
    highlights: item.description ? [item.description] : []
  }));
  if (education.length) {
    sections.push(makeSection(resumeId, "education", 5, { items: education }));
  }

  const skills = (model.skills || []).map((group, idx) => ({
    id: `skill-cat-${idx + 1}`,
    name: group.category || "技能",
    skills: normalizeSkillItems(group.items || [])
  }));
  if (skills.length) {
    sections.push(makeSection(resumeId, "skills", 6, { categories: skills }));
  }

  const certifications = (model.certifications || []).map((item, idx) => ({
    id: `cert-${idx + 1}`,
    name: item.name || "",
    issuer: item.issuer || "",
    date: item.date || "",
    url: item.url || ""
  }));
  if (certifications.length) {
    sections.push(makeSection(resumeId, "certifications", 7, { items: certifications }));
  }

  const languages = (model.languages || []).map((item, idx) => ({
    id: `lang-${idx + 1}`,
    language: item.language || "",
    proficiency: item.proficiency || "",
    description: item.description || ""
  }));
  if (languages.length) {
    sections.push(makeSection(resumeId, "languages", 8, { items: languages }));
  }

  const github = (model.github || []).map((item, idx) => ({
    id: `github-${idx + 1}`,
    repoUrl: item.repo_url || item.repoUrl || "",
    name: item.name || "",
    stars: Number(item.stars || 0),
    language: item.language || "",
    description: item.description || ""
  }));
  if (github.length) {
    sections.push(makeSection(resumeId, "github", 9, { items: github }));
  }

  const customItems = (model.custom_sections || []).flatMap((section, secIdx) =>
    collectCustomSectionLines(section).map((line, lineIdx) => ({
      id: `custom-${secIdx + 1}-${lineIdx + 1}`,
      title: section.title || "附加信息",
      subtitle: "",
      date: "",
      description: line
    }))
  );
  if (customItems.length) {
    sections.push(makeSection(resumeId, "custom", 10, { items: customItems }));
  }

  const manualQrCodes = (model.qr_codes || [])
    .filter((item) => item?.url)
    .map((item, idx) => ({
      id: `manual-qr-${idx + 1}`,
      label: item.label || item.name || item.title || `链接 ${idx + 1}`,
      url: item.url || ""
    }));
  if (manualQrCodes.length) {
    sections.push(makeSection(resumeId, "qr_codes", 11, { items: manualQrCodes }));
  }

  const autoQrItems = extractUrlsFromResume(sections);
  if (autoQrItems.length) {
    const existing = sections.find((section) => section.type === "qr_codes");
    if (existing) {
      const currentItems = (existing.content as any).items || [];
      const merged = [...currentItems, ...autoQrItems].filter((item, idx, arr) => {
        const key = String(item.url || "").toLowerCase();
        return arr.findIndex((candidate) => String(candidate.url || "").toLowerCase() === key) === idx;
      });
      existing.content = { items: merged } as any;
    } else {
      sections.push(makeSection(resumeId, "qr_codes", 11, { items: autoQrItems }));
    }
  }

  applyRenderConfig(sections, model.render_config);

  const now = new Date();
  return {
    id: resumeId,
    userId: "cli",
    title: basicName ? `${basicName}-resume` : "resume",
    template: model.render_config?.template || templateName,
    themeConfig: normalizeTheme(templateName, model),
    isDefault: false,
    language: "zh",
    sections,
    createdAt: now,
    updatedAt: now
  };
}

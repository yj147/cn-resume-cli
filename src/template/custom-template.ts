import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TEMPLATE_ALIASES, TEMPLATE_GROUPS, TEMPLATE_LIST } from "../constants.js";
import { readJson, writeJson } from "../core/io.js";
import { buildEmptyField, buildEmptyModel, collectCustomSectionLines, normalizeBulletList } from "../core/model.js";
import { FIELD_SOURCES, FIELD_STATUSES, getFieldValue } from "../core/provenance.js";
import { modelToDocumentIR, modelToThemeConfig } from "../jadeai/adapter.js";
import { generateHtml as buildTemplateHtml } from "../jadeai/builders.js";
import { buildRenderTree } from "../layout-core/render-tree.js";
import { modelToPlainText } from "../flows/render.js";
import { resolveTemplateSpec } from "./spec.js";
import { generateThumbnail } from "./thumbnail.js";

type CustomTemplateConfig = {
  aliases: Record<string, string>;
  imports: Record<string, string>;
};

export type ResolvedTemplate = {
  requested: string;
  resolved: string;
  kind: "builtin" | "imported";
  sourcePath?: string;
  spec: ReturnType<typeof resolveTemplateSpec> | null;
};

function normalizeTemplateKey(inputName) {
  return String(inputName || "").trim().toLowerCase();
}

function normalizeCustomTemplateConfig(rawConfig): CustomTemplateConfig {
  const aliases =
    rawConfig && typeof rawConfig.aliases === "object" && !Array.isArray(rawConfig.aliases) ? rawConfig.aliases : {};
  const imports =
    rawConfig && typeof rawConfig.imports === "object" && !Array.isArray(rawConfig.imports) ? rawConfig.imports : {};
  return {
    aliases: Object.fromEntries(
      Object.entries(aliases)
        .map(([key, value]) => [normalizeTemplateKey(key), normalizeTemplateKey(value)])
        .filter((entry) => entry[0] && entry[1])
    ),
    imports: Object.fromEntries(
      Object.entries(imports)
        .map(([key, value]) => [normalizeTemplateKey(key), String(value || "").trim()])
        .filter((entry) => entry[0] && entry[1])
    )
  };
}

export function loadCustomTemplateConfig(): CustomTemplateConfig {
  const configFile = path.join(os.homedir(), ".cn-resume", "templates.json");
  if (!fs.existsSync(configFile)) {
    return { aliases: {}, imports: {} };
  }
  try {
    return normalizeCustomTemplateConfig(readJson(configFile));
  } catch {
    return { aliases: {}, imports: {} };
  }
}

export function saveCustomTemplateConfig(config: CustomTemplateConfig) {
  const configFile = path.join(os.homedir(), ".cn-resume", "templates.json");
  writeJson(configFile, normalizeCustomTemplateConfig(config));
}

function ensureReadableFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template file does not exist: ${filePath}`);
  }
  fs.accessSync(filePath, fs.constants.R_OK);
}

export function validateImportedTemplateSource(filePath) {
  ensureReadableFile(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.trim()) {
    throw new Error(`Imported template is empty: ${filePath}`);
  }
  const openCount = (source.match(/\{\{/g) || []).length;
  const closeCount = (source.match(/\}\}/g) || []).length;
  if (openCount !== closeCount) {
    throw new Error(`Template syntax invalid: placeholder braces are not balanced in ${filePath}`);
  }
}

export function resolveTemplate(templateName, customConfig = loadCustomTemplateConfig()): ResolvedTemplate {
  const requested = normalizeTemplateKey(templateName || "elegant");
  if (!requested) {
    throw new Error("Template name cannot be empty.");
  }

  if (customConfig.imports[requested]) {
    const sourcePath = path.resolve(customConfig.imports[requested]);
    ensureReadableFile(sourcePath);
    return { requested, resolved: requested, kind: "imported", sourcePath, spec: null };
  }

  const seen = new Set();
  let cursor = requested;
  while (customConfig.aliases[cursor]) {
    if (seen.has(cursor)) {
      throw new Error(`Template alias cycle detected around '${cursor}'.`);
    }
    seen.add(cursor);
    cursor = normalizeTemplateKey(customConfig.aliases[cursor]);
  }

  if (customConfig.imports[cursor]) {
    const sourcePath = path.resolve(customConfig.imports[cursor]);
    ensureReadableFile(sourcePath);
    return { requested, resolved: cursor, kind: "imported", sourcePath, spec: null };
  }

  const builtin = TEMPLATE_ALIASES[cursor] || cursor;
  try {
    const spec = resolveTemplateSpec(builtin);
    return { requested, resolved: builtin, kind: "builtin", spec };
  } catch (error) {
    if (!String(error?.message || error).startsWith("Unsupported template")) {
      throw error;
    }
  }

  throw new Error(`Unsupported template '${templateName}'. Use 'cn-resume template list'.`);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTemplateListItems(lines) {
  return lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
}

function buildTemplateSections(model) {
  const experience = (model.experience || []).flatMap((item) => {
    const header = `${getFieldValue(item.role) || ""} @ ${getFieldValue(item.company) || ""}`.trim();
    const bullets = normalizeBulletList(item.bullets || []).map((line) => `• ${line}`);
    return [header, ...bullets].filter(Boolean);
  });
  const projects = (model.projects || []).flatMap((item) => {
    const header = `${getFieldValue(item.name) || ""}`.trim();
    const bullets = normalizeBulletList(item.bullets || []).map((line) => `• ${line}`);
    return [header, ...bullets].filter(Boolean);
  });
  const skills = (model.skills || []).map(
    (group) =>
      `${group.category || "技能"}: ${(group.items || [])
        .map((entry) => (typeof entry === "string" ? entry : entry?.name || ""))
        .filter(Boolean)
        .join("、")}`
  );
  const education = (model.education || []).map(
    (item) => `${getFieldValue(item.school) || ""} ${getFieldValue(item.degree) || ""} ${getFieldValue(item.major) || ""}`.trim()
  );
  const certifications = (model.certifications || []).map((item) => `${item.name || ""} ${item.issuer ? `(${item.issuer})` : ""}`.trim());
  const languages = (model.languages || []).map((item) => `${item.language || ""} ${item.proficiency ? `(${item.proficiency})` : ""}`.trim());
  const github = (model.github || []).map((item) => `${item.name || ""} ${item.repo_url || item.repoUrl || ""}`.trim());
  const custom = (model.custom_sections || []).flatMap((section) => {
    const lines = collectCustomSectionLines(section);
    return lines.map((line) => `${section.title || "附加信息"}: ${line}`);
  });
  return { experience, projects, skills, education, certifications, languages, github, custom };
}

function renderImportedTemplate(model, resolvedTemplate: ResolvedTemplate) {
  const filePath = resolvedTemplate.sourcePath;
  if (!filePath) {
    throw new Error("Imported template source path is missing.");
  }
  ensureReadableFile(filePath);
  const templateText = fs.readFileSync(filePath, "utf8");
  if (!templateText.trim()) {
    throw new Error(`Imported template is empty: ${filePath}`);
  }

  const basic = model.basic || {};
  const basicName = getFieldValue(basic.name);
  const basicTitle = getFieldValue(basic.title);
  const basicEmail = getFieldValue(basic.email);
  const basicPhone = getFieldValue(basic.phone);
  const basicLocation = getFieldValue(basic.location);
  const basicWebsite = getFieldValue(basic.website);
  const basicSummary = getFieldValue(basic.summary);
  const sections = buildTemplateSections(model);
  const mapping = {
    template_name: resolvedTemplate.resolved,
    name: basicName || "",
    title: basicTitle || "",
    email: basicEmail || "",
    phone: basicPhone || "",
    location: basicLocation || "",
    website: basicWebsite || "",
    summary: basicSummary || "",
    contact_line: [basicPhone, basicEmail, basicLocation, basicWebsite].filter(Boolean).join(" | "),
    plain_text: modelToPlainText(model),
    resume_json: JSON.stringify(model, null, 2),
    experience_html: `<ul>${buildTemplateListItems(sections.experience)}</ul>`,
    projects_html: `<ul>${buildTemplateListItems(sections.projects)}</ul>`,
    skills_html: `<ul>${buildTemplateListItems(sections.skills)}</ul>`,
    education_html: `<ul>${buildTemplateListItems(sections.education)}</ul>`,
    certifications_html: `<ul>${buildTemplateListItems(sections.certifications)}</ul>`,
    languages_html: `<ul>${buildTemplateListItems(sections.languages)}</ul>`,
    github_html: `<ul>${buildTemplateListItems(sections.github)}</ul>`,
    custom_html: `<ul>${buildTemplateListItems(sections.custom)}</ul>`
  };

  const rendered = templateText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_all, rawKey) => {
    const key = String(rawKey || "").trim();
    if (!(key in mapping)) {
      return "";
    }
    if (key.endsWith("_html")) {
      return mapping[key];
    }
    return escapeHtml(mapping[key]);
  });

  if (!/<html[\s>]/i.test(rendered)) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(basicName || "resume")}</title></head><body>${rendered}</body></html>`;
  }
  return rendered;
}

function createBuiltinRenderContext(model, resolvedTemplate: ResolvedTemplate) {
  if (resolvedTemplate.kind !== "builtin" || !resolvedTemplate.spec) {
    throw new Error("BLOCKED: builtin template render context requires TemplateSpec.");
  }
  const basicName = getFieldValue(model?.basic?.name);
  const input = {
    document: modelToDocumentIR(model, resolvedTemplate.resolved),
    templateSpec: resolvedTemplate.spec,
    themeConfig: modelToThemeConfig(model, resolvedTemplate.resolved),
    title: basicName ? `${basicName}-resume` : "resume",
    language: "zh"
  };
  return {
    input,
    renderTree: buildRenderTree(input)
  };
}

export async function renderTemplate(model, templateName, forPdf = false) {
  const customConfig = loadCustomTemplateConfig();
  const resolvedTemplate = resolveTemplate(templateName, customConfig);
  if (resolvedTemplate.kind === "imported") {
    return {
      html: renderImportedTemplate(model, resolvedTemplate),
      template: resolvedTemplate.resolved,
      custom: true
    };
  }
  const { input, renderTree } = createBuiltinRenderContext(model, resolvedTemplate);
  return {
    html: await buildTemplateHtml(input, forPdf, renderTree),
    template: resolvedTemplate.resolved,
    custom: false,
    renderTree
  };
}

export async function renderTemplateThumbnail(model, templateName) {
  const customConfig = loadCustomTemplateConfig();
  const resolvedTemplate = resolveTemplate(templateName, customConfig);
  if (resolvedTemplate.kind !== "builtin") {
    throw new Error("BLOCKED: thumbnail rendering only supports builtin templates.");
  }
  const { input, renderTree } = createBuiltinRenderContext(model, resolvedTemplate);
  const thumbnail = generateThumbnail(input, renderTree);
  return {
    html: thumbnail.html,
    template: resolvedTemplate.resolved,
    custom: false,
    renderTree: thumbnail.renderTree,
    sections: thumbnail.sections,
    accentColor: thumbnail.accentColor,
    layoutFamily: thumbnail.layoutFamily
  };
}

export function templateListPayload() {
  const custom = loadCustomTemplateConfig();
  return {
    builtins: TEMPLATE_LIST,
    imports: Object.keys(custom.imports || {}),
    aliases: { ...TEMPLATE_ALIASES, ...(custom.aliases || {}) },
    groups: TEMPLATE_GROUPS
  };
}

export function createTemplatePreviewSample() {
  const sampleModel = buildEmptyModel();
  const sampleUpdatedAt = new Date().toISOString();
  sampleModel.basic = {
    name: buildEmptyField({ value: "张三" }),
    title: buildEmptyField({ value: "高级后端工程师" }),
    photo: buildEmptyField(),
    birth_date: buildEmptyField(),
    email: buildEmptyField({ value: "zhangsan@example.com" }),
    phone: buildEmptyField({ value: "13800000000" }),
    location: buildEmptyField({ value: "上海" }),
    website: buildEmptyField({ value: "github.com/zhangsan" }),
    linkedin: buildEmptyField(),
    github: buildEmptyField({ value: "github.com/zhangsan" }),
    employment_status: buildEmptyField(),
    summary: buildEmptyField({ value: "10年后端与平台工程经验，关注稳定性、性能与团队交付效率。" })
  };
  sampleModel.experience = [
    {
      company: buildEmptyField({ value: "某互联网公司" }),
      role: buildEmptyField({ value: "技术负责人" }),
      start: buildEmptyField({ value: "2021-06" }),
      end: buildEmptyField({ value: "至今" }),
      provenance: {
        source: FIELD_SOURCES.USER_EXPLICIT,
        confidence: 1,
        status: FIELD_STATUSES.CONFIRMED,
        updatedBy: FIELD_SOURCES.USER_EXPLICIT,
        updatedAt: sampleUpdatedAt
      },
      bullets: [
        "主导核心服务重构，稳定支撑千万级请求。",
        "推动工程效能治理，发布效率提升40%。"
      ]
    }
  ];
  sampleModel.projects = [
    {
      name: buildEmptyField({ value: "实时风控平台" }),
      provenance: {
        source: FIELD_SOURCES.USER_EXPLICIT,
        confidence: 1,
        status: FIELD_STATUSES.CONFIRMED,
        updatedBy: FIELD_SOURCES.USER_EXPLICIT,
        updatedAt: sampleUpdatedAt
      },
      bullets: ["设计事件流处理链路，延迟降低至50ms内。", "建设告警闭环，故障恢复时间降低60%。"]
    }
  ];
  sampleModel.skills = [
    {
      category: "技术栈",
      items: [{ name: "Node.js" }, { name: "Go" }, { name: "PostgreSQL" }, { name: "Redis" }]
    }
  ];
  sampleModel.education = [
    {
      school: buildEmptyField({ value: "某大学" }),
      degree: buildEmptyField({ value: "硕士" }),
      major: buildEmptyField({ value: "计算机科学" }),
      provenance: {
        source: FIELD_SOURCES.USER_EXPLICIT,
        confidence: 1,
        status: FIELD_STATUSES.CONFIRMED,
        updatedBy: FIELD_SOURCES.USER_EXPLICIT,
        updatedAt: sampleUpdatedAt
      }
    }
  ];
  sampleModel.custom_sections = [{ title: "个人优势", content: "强执行与跨团队协作能力", items: ["强执行与跨团队协作能力"] }];
  return sampleModel;
}

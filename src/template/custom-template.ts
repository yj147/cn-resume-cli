import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TEMPLATE_ALIASES, TEMPLATE_GROUPS, TEMPLATE_LIST } from "../constants.js";
import { readJson, writeJson } from "../core/io.js";
import { buildEmptyModel, normalizeBulletList } from "../core/model.js";
import { modelToJadeResume } from "../jadeai/adapter.js";
import { generateHtml as buildTemplateHtml } from "../jadeai/builders.js";
import { modelToPlainText } from "../flows/render.js";

type CustomTemplateConfig = {
  aliases: Record<string, string>;
  imports: Record<string, string>;
};

export type ResolvedTemplate = {
  requested: string;
  resolved: string;
  kind: "builtin" | "imported";
  sourcePath?: string;
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
    return { requested, resolved: requested, kind: "imported", sourcePath };
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
    return { requested, resolved: cursor, kind: "imported", sourcePath };
  }

  const builtin = TEMPLATE_ALIASES[cursor] || cursor;
  if (TEMPLATE_LIST.includes(builtin)) {
    return { requested, resolved: builtin, kind: "builtin" };
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
    const header = `${item.role || ""} @ ${item.company || ""}`.trim();
    const bullets = normalizeBulletList(item.bullets || []).map((line) => `• ${line}`);
    return [header, ...bullets].filter(Boolean);
  });
  const projects = (model.projects || []).flatMap((item) => {
    const header = `${item.name || ""}`.trim();
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
  const education = (model.education || []).map((item) => `${item.school || ""} ${item.degree || ""} ${item.major || ""}`.trim());
  const certifications = (model.certifications || []).map((item) => `${item.name || ""} ${item.issuer ? `(${item.issuer})` : ""}`.trim());
  const languages = (model.languages || []).map((item) => `${item.language || ""} ${item.proficiency ? `(${item.proficiency})` : ""}`.trim());
  const github = (model.github || []).map((item) => `${item.name || ""} ${item.repo_url || item.repoUrl || ""}`.trim());
  const custom = (model.custom_sections || []).flatMap((section) => {
    const lines = normalizeBulletList(section.items || []).concat(normalizeBulletList(section.content || ""));
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
  const sections = buildTemplateSections(model);
  const mapping = {
    template_name: resolvedTemplate.resolved,
    name: basic.name || "",
    title: basic.title || "",
    email: basic.email || "",
    phone: basic.phone || "",
    location: basic.location || "",
    website: basic.website || "",
    summary: basic.summary || "",
    contact_line: [basic.phone, basic.email, basic.location, basic.website].filter(Boolean).join(" | "),
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
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(basic.name || "resume")}</title></head><body>${rendered}</body></html>`;
  }
  return rendered;
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
  const resume = modelToJadeResume(model, resolvedTemplate.resolved);
  return {
    html: await buildTemplateHtml(resume, forPdf),
    template: resolvedTemplate.resolved,
    custom: false
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
  sampleModel.basic = {
    name: "张三",
    title: "高级后端工程师",
    photo: "",
    birth_date: "",
    email: "zhangsan@example.com",
    phone: "13800000000",
    location: "上海",
    website: "github.com/zhangsan",
    linkedin: "",
    github: "github.com/zhangsan",
    employment_status: "",
    summary: "10年后端与平台工程经验，关注稳定性、性能与团队交付效率。"
  };
  sampleModel.experience = [
    {
      company: "某互联网公司",
      role: "技术负责人",
      start: "2021-06",
      end: "至今",
      bullets: [
        "主导核心服务重构，稳定支撑千万级请求。",
        "推动工程效能治理，发布效率提升40%。"
      ]
    }
  ];
  sampleModel.projects = [
    {
      name: "实时风控平台",
      bullets: ["设计事件流处理链路，延迟降低至50ms内。", "建设告警闭环，故障恢复时间降低60%。"]
    }
  ];
  sampleModel.skills = [
    {
      category: "技术栈",
      items: [{ name: "Node.js" }, { name: "Go" }, { name: "PostgreSQL" }, { name: "Redis" }]
    }
  ];
  sampleModel.education = [{ school: "某大学", degree: "硕士", major: "计算机科学" }];
  sampleModel.custom_sections = [{ title: "个人优势", content: "强执行与跨团队协作能力", items: ["强执行与跨团队协作能力"] }];
  return sampleModel;
}


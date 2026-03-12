import path from "node:path";
import { AI_MAX_ATTEMPTS, callAiJson, runAiWithSchemaRecovery } from "../ai.js";
import { readJson, readText } from "../core/io.js";
import {
  buildEmptyModel,
  buildEmptyField,
  normalizeBulletList,
  normalizeReactiveJson,
  nowIso,
  splitDateRange
} from "../core/model.js";
import { FIELD_SOURCES, getFieldValue } from "../core/provenance.js";
import { loadPdfForAiParsing, parsePdfToText } from "../pdf.js";
import { modelToJadeResume } from "../jadeai/adapter.js";

export const PHASE_B_PROMPT = "哪里需要修改？请指出具体模块与条目。";
const PARSE_EVIDENCE_VERSION = "section-first-v1";

const PARSED_RESUME_SCHEMA_HINT = {
  personalInfo: {
    fullName: "",
    jobTitle: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    linkedin: "",
    github: ""
  },
  summary: "",
  workExperience: [
    {
      company: "",
      position: "",
      location: "",
      startDate: "YYYY-MM",
      endDate: "YYYY-MM or null",
      current: false,
      description: "",
      highlights: ["bullet 1"]
    }
  ],
  education: [
    {
      institution: "",
      degree: "",
      field: "",
      location: "",
      startDate: "YYYY-MM",
      endDate: "YYYY-MM",
      gpa: "",
      highlights: []
    }
  ],
  skills: [{ name: "category", skills: ["skill1"] }],
  projects: [{ name: "", description: "", technologies: [], highlights: [] }],
  certifications: [{ name: "", issuer: "", date: "" }],
  languages: [{ language: "", proficiency: "" }]
};

const MODEL_WRAPPER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["model"],
  properties: {
    model: { type: "object", additionalProperties: true },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  }
};

function toFixedConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
}

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

function hasArrayValues(value) {
  return Array.isArray(value) && value.some((item) => hasValue(item));
}

function maskSensitivePreview(value) {
  const raw = String(value || "").replace(/\s+/g, "").trim();
  if (!raw) {
    return "";
  }
  if (raw.length <= 4) {
    return `${raw[0] || ""}***${raw.slice(-1) || ""}`;
  }
  if (raw.length <= 8) {
    return `${raw.slice(0, 1)}***${raw.slice(-1)}`;
  }
  return `${raw.slice(0, 3)}***${raw.slice(-2)}`;
}

function detectSensitiveFindings(model) {
  const payload = JSON.stringify({
    basic: model.basic || {},
    experience: model.experience || [],
    projects: model.projects || [],
    education: model.education || [],
    custom_sections: model.custom_sections || []
  });
  const rules = [
    {
      type: "id_card",
      severity: "high",
      pattern: /\b\d{17}[\dXx]\b/g,
      message: "检测到疑似身份证号，建议移除后再投递。"
    },
    {
      type: "bank_card",
      severity: "high",
      pattern: /\b\d{16,19}\b/g,
      message: "检测到疑似银行卡号，建议立即删除。"
    },
    {
      type: "home_address",
      severity: "medium",
      pattern: /(?:家庭住址|详细地址|住址|现居住地)[:：]?\s*([^\n,，;；]{6,40})/g,
      message: "检测到疑似详细住址，建议仅保留城市级信息。"
    }
  ];

  const findings = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(payload)) !== null) {
      const raw = match[1] || match[0] || "";
      findings.push({
        type: rule.type,
        severity: rule.severity,
        field_path: "resume",
        masked_preview: maskSensitivePreview(raw),
        message: rule.message
      });
      if (findings.length >= 20) {
        return findings;
      }
    }
  }
  return findings;
}

export function attachParseDiagnostics(model) {
  const findings = detectSensitiveFindings(model);
  const warnings = findings.map((item) => `${item.message}（${item.masked_preview}）`);
  model.meta = {
    ...(model.meta || {}),
    parse_flags: {
      has_sensitive: findings.length > 0,
      blocked: false
    },
    parse_warnings: warnings,
    sensitive_findings: findings
  };
  return warnings;
}

function buildSectionParseEvidence(section) {
  const content = section?.content || {};
  const evidence = [];
  let itemCount = 0;
  let confidence = 0;

  if (section.type === "personal_info") {
    const fullName = String(content.fullName || "").trim();
    const hasContact = hasValue(content.email) || hasValue(content.phone);
    const hasTitle = hasValue(content.jobTitle);
    const hasProfile = hasValue(content.website) || hasValue(content.github) || hasValue(content.linkedin);
    if (fullName) evidence.push("name");
    if (hasContact) evidence.push("contact");
    if (hasTitle) evidence.push("job_title");
    if (hasProfile) evidence.push("profile_link");
    itemCount = [fullName, hasContact, hasTitle].filter(Boolean).length;
    confidence = 0.1 + (fullName ? 0.35 : 0) + (hasContact ? 0.35 : 0) + (hasTitle ? 0.1 : 0) + (hasProfile ? 0.1 : 0);
  } else if (section.type === "summary") {
    const text = String(content.text || "").trim();
    const length = text.length;
    if (length) evidence.push(`chars=${length}`);
    if (/[。；;.!?]/.test(text)) evidence.push("sentence_like");
    itemCount = length ? 1 : 0;
    confidence = length ? 0.25 + Math.min(0.5, length / 180) + (/[。；;.!?]/.test(text) ? 0.15 : 0) : 0;
  } else if (section.type === "skills") {
    const categories = Array.isArray(content.categories) ? content.categories : [];
    const categoryCount = categories.length;
    const totalSkills = categories.reduce((sum, cat) => {
      if (!Array.isArray(cat?.skills)) {
        return sum;
      }
      return sum + cat.skills.filter((skill) => hasValue(skill)).length;
    }, 0);
    if (categoryCount) evidence.push(`categories=${categoryCount}`);
    if (totalSkills) evidence.push(`skills=${totalSkills}`);
    itemCount = totalSkills;
    confidence = categoryCount ? 0.25 + Math.min(0.3, categoryCount * 0.1) + Math.min(0.45, totalSkills * 0.06) : 0;
  } else {
    const items = Array.isArray(content.items) ? content.items : [];
    itemCount = items.length;
    if (itemCount) evidence.push(`items=${itemCount}`);
    let withName = 0;
    let withDate = 0;
    let withDetail = 0;
    for (const item of items) {
      const hasName =
        hasValue(item?.company) ||
        hasValue(item?.position) ||
        hasValue(item?.name) ||
        hasValue(item?.institution) ||
        hasValue(item?.degree) ||
        hasValue(item?.language) ||
        hasValue(item?.title) ||
        hasValue(item?.label);
      const hasDate = hasValue(item?.startDate) || hasValue(item?.endDate) || hasValue(item?.date) || Boolean(item?.current);
      const hasDetail =
        hasArrayValues(item?.highlights) ||
        hasValue(item?.description) ||
        hasArrayValues(item?.technologies) ||
        hasValue(item?.url) ||
        hasValue(item?.repoUrl) ||
        hasValue(item?.issuer) ||
        hasValue(item?.proficiency);
      if (hasName) withName += 1;
      if (hasDate) withDate += 1;
      if (hasDetail) withDetail += 1;
    }
    if (itemCount) {
      const namedRatio = withName / itemCount;
      const dateRatio = withDate / itemCount;
      const detailRatio = withDetail / itemCount;
      evidence.push(`named_ratio=${namedRatio.toFixed(2)}`);
      evidence.push(`date_ratio=${dateRatio.toFixed(2)}`);
      evidence.push(`detail_ratio=${detailRatio.toFixed(2)}`);
      confidence =
        0.2 +
        Math.min(0.2, itemCount * 0.05) +
        namedRatio * 0.25 +
        dateRatio * 0.2 +
        detailRatio * 0.25;
    }
  }

  return {
    type: section.type,
    title: section.title || section.type,
    visible: Boolean(section.visible),
    item_count: itemCount,
    confidence: toFixedConfidence(confidence),
    evidence
  };
}

export function buildSectionFirstParseEvidence(model) {
  const templateName = String(model?.render_config?.template || model?.meta?.template || "elegant").trim() || "elegant";
  const resume = modelToJadeResume(model, templateName);
  const sections = (resume.sections || []).map((section) => buildSectionParseEvidence(section));
  const weightedSections = sections.filter(
    (section) => section.visible && (section.item_count > 0 || section.type === "personal_info" || section.type === "summary")
  );
  const weightedTotal = weightedSections.reduce((sum, section) => {
    const weight = Math.max(1, Math.min(4, section.item_count || 1));
    return sum + weight;
  }, 0);
  const weightedScore = weightedSections.reduce((sum, section) => {
    const weight = Math.max(1, Math.min(4, section.item_count || 1));
    return sum + section.confidence * weight;
  }, 0);

  return {
    version: PARSE_EVIDENCE_VERSION,
    paradigm: "jadeai-section-first",
    template: resume.template || templateName,
    overall_confidence: toFixedConfidence(weightedTotal ? weightedScore / weightedTotal : 0),
    sections
  };
}

export function assertRequiredContactOrThrow(model) {
  const name = String(getFieldValue(model?.basic?.name) || "").trim();
  const hasContact = [model?.basic?.email, model?.basic?.phone].some((value) => String(getFieldValue(value) || "").trim().length > 0);
  if (name && hasContact) {
    return;
  }
  throw new Error("BLOCKED: missing_contact (requires name + email/phone)");
}

function buildSectionSnapshot(model, fieldName, keyField) {
  const items = Array.isArray(model?.[fieldName]) ? model[fieldName] : [];
  return items.map((item) => ({
    key: String(getFieldValue(item?.[keyField]) || "").trim(),
    bullets: normalizeBulletList(item?.bullets || []).slice(0, 3)
  }));
}

export function buildPhaseBDiffSnapshot(beforeModel, afterModel) {
  return {
    experience_before: buildSectionSnapshot(beforeModel, "experience", "company"),
    experience_after: buildSectionSnapshot(afterModel, "experience", "company"),
    projects_before: buildSectionSnapshot(beforeModel, "projects", "name"),
    projects_after: buildSectionSnapshot(afterModel, "projects", "name")
  };
}

function isPhaseBConfirmed(model) {
  const phaseB = model?.meta?.phase_b;
  if (!phaseB || typeof phaseB !== "object") {
    return true;
  }
  if (phaseB.requires_confirmation === false) {
    return true;
  }
  return Boolean(phaseB.confirmed);
}

export function assertPhaseBConfirmedOrThrow(model, commandName) {
  if (isPhaseBConfirmed(model)) {
    return;
  }
  throw new Error(
    `BLOCKED: phase_b_unconfirmed. ${PHASE_B_PROMPT} Re-run optimize with --feedback \"...\" --confirm before ${commandName}.`
  );
}

const SECTION_HEADINGS = {
  experience: ["工作经历", "工作经验", "职业经历", "实习经历"],
  projects: ["项目经历", "项目经验", "项目"],
  education: ["教育经历", "教育背景"],
  skills: ["技能", "专业技能", "技术栈", "技能清单"]
};

const EXTRA_HEADINGS = ["个人优势", "自我评价", "个人信息", "基本信息", "联系方式"];
const DATE_RANGE_PATTERN =
  /(?:19|20)\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?\s*(?:[-~—–至]+\s*(?:19|20)\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?|[-~—–至]+\s*(?:至今|现在|current|present))/i;

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitTextLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripLeadingMarker(line) {
  return String(line || "")
    .replace(/^[\s>*•·\-]+/, "")
    .replace(/^\d+[.)、]\s*/, "")
    .trim();
}

function normalizeCompareKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\u4e00-\u9fa5a-z0-9]/g, "");
}

function dedupeStringList(items) {
  const seen = new Set();
  const result = [];
  for (const raw of items) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = normalizeCompareKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function readMaybeFieldValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    return getFieldValue(value);
  }
  return String(value || "");
}

function isAnySectionHeadingLine(line) {
  const all = [...SECTION_HEADINGS.experience, ...SECTION_HEADINGS.projects, ...SECTION_HEADINGS.education, ...SECTION_HEADINGS.skills, ...EXTRA_HEADINGS];
  const text = String(line || "").trim();
  const pattern = new RegExp(`^(?:${all.map(escapeRegex).join("|")})\\s*[:：]?$`, "i");
  return pattern.test(text);
}

function isContactOrProfileLine(line) {
  const text = String(line || "").trim();
  if (!text) return true;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return true;
  if (/(?:\+?86[-\s]?)?1[3-9]\d{9}/.test(text)) return true;
  if (/^(?:邮箱|邮件|电话|手机|微信|qq|github|linkedin|住址|地址|联系方式)[:：]/i.test(text)) return true;
  if (/^(?:https?:\/\/|www\.)/i.test(text)) return true;
  return false;
}

function extractSectionText(text, headings) {
  const allStopHeadings = [
    ...SECTION_HEADINGS.experience,
    ...SECTION_HEADINGS.projects,
    ...SECTION_HEADINGS.education,
    ...SECTION_HEADINGS.skills,
    ...EXTRA_HEADINGS
  ];
  const start = headings.map(escapeRegex).join("|");
  const stop = allStopHeadings.map(escapeRegex).join("|");
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:${start})\\s*[:：]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${stop})\\s*[:：]?\\s*|$)`, "i");
  const matched = String(text || "").match(pattern);
  return matched?.[1]?.trim() || "";
}

function splitSectionBlocks(sectionText) {
  const normalized = String(sectionText || "").trim();
  if (!normalized) return [];
  const primary = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (primary.length > 1) {
    return primary;
  }
  const lines = splitTextLines(normalized);
  if (!lines.length) return [];
  const blocks = [];
  let current = [];
  for (const raw of lines) {
    const line = stripLeadingMarker(raw);
    if (!line) continue;
    const startsNew = /^(?:项目[一二三四五六七八九十\d]+|[A-Z][A-Za-z0-9 ._-]{2,}|(?:19|20)\d{2}[./-]\d{1,2})/.test(line) && current.length >= 2;
    if (startsNew) {
      blocks.push(current.join("\n"));
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length) {
    blocks.push(current.join("\n"));
  }
  return blocks;
}

function hasDateRangeToken(line) {
  return DATE_RANGE_PATTERN.test(String(line || ""));
}

function mergeWrappedLines(rawLines) {
  const merged = [];
  for (const entry of rawLines) {
    const line = String(entry || "").trim();
    if (!line) continue;
    if (!merged.length) {
      merged.push(line);
      continue;
    }
    const prev = merged[merged.length - 1];
    const isContinuation =
      !/[。！？；;:：]$/.test(prev) &&
      !hasDateRangeToken(prev) &&
      !/^[\-*•·]/.test(line) &&
      !isAnySectionHeadingLine(line) &&
      !/^(?:主修课程|核心课程|课程)[:：]/.test(line) &&
      !/^[A-Za-z\u4e00-\u9fa5][^:：]{0,16}[:：]$/.test(line) &&
      !hasDateRangeToken(line);
    if (isContinuation) {
      merged[merged.length - 1] = `${prev}${line}`;
    } else {
      merged.push(line);
    }
  }
  return merged;
}

function extractDateRangeFromLines(lines) {
  for (const line of lines) {
    const hit = String(line || "").match(DATE_RANGE_PATTERN);
    if (!hit) continue;
    const cleaned = hit[0].replace(/[()（）]/g, "").trim();
    const { start, end } = splitDateRange(cleaned);
    return { start, end, line: String(line || "") };
  }
  return { start: "", end: "", line: "" };
}

function containsCompanyKeyword(text) {
  return /(公司|集团|科技|软件|网络|银行|大学|学院|研究院|事务所|实验室|Ltd|Inc|Corp|Studio)/i.test(String(text || ""));
}

function parseExperienceHeader(header) {
  const withoutDate = String(header || "")
    .replace(new RegExp(DATE_RANGE_PATTERN.source, "gi"), "")
    .trim();
  const parts = withoutDate
    .split(/\s*[-|｜@·•]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const second = parts[1];
    if (containsCompanyKeyword(first) && !containsCompanyKeyword(second)) {
      return { company: first, role: second };
    }
    if (!containsCompanyKeyword(first) && containsCompanyKeyword(second)) {
      return { company: second, role: first };
    }
    return { company: first, role: second };
  }
  if (containsCompanyKeyword(withoutDate)) {
    return { company: withoutDate, role: "" };
  }
  return { company: "", role: withoutDate };
}

function splitSkillItems(rawValue) {
  const raw = stripLeadingMarker(rawValue);
  const items = [];
  let buffer = "";
  let depth = 0;
  const openSet = new Set(["(", "[", "{", "（", "【"]);
  const closeSet = new Set([")", "]", "}", "）", "】"]);
  const separators = new Set(["、", ",", "，", ";", "；", "|", "/"]);

  for (const ch of raw) {
    if (openSet.has(ch)) {
      depth += 1;
      buffer += ch;
      continue;
    }
    if (closeSet.has(ch)) {
      depth = Math.max(0, depth - 1);
      buffer += ch;
      continue;
    }
    if (depth === 0 && separators.has(ch)) {
      const token = buffer.trim();
      if (token) items.push(token);
      buffer = "";
      continue;
    }
    buffer += ch;
  }
  const last = buffer.trim();
  if (last) items.push(last);

  return dedupeStringList(
    items
      .flatMap((item) => item.split(/\s{2,}/))
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && !/[：:]$/.test(item) && !/^(技能|技术栈|掌握|熟悉)$/.test(item))
  ).slice(0, 24);
}

function dedupeExperienceAgainstProjects(experience, projects) {
  const projectNameKeys = new Set(
    (projects || [])
      .map((item) => normalizeCompareKey(readMaybeFieldValue(item?.name)))
      .filter((key) => key.length >= 4)
  );
  const projectBulletKeys = new Set(
    (projects || [])
      .flatMap((item) => normalizeBulletList(item?.bullets || []))
      .map((line) => normalizeCompareKey(line))
      .filter((key) => key.length >= 12)
  );
  return (experience || []).filter((item) => {
    const headerKey = normalizeCompareKey(`${readMaybeFieldValue(item?.company)}${readMaybeFieldValue(item?.role)}`);
    if (headerKey && projectNameKeys.has(headerKey)) {
      return false;
    }
    const overlap = normalizeBulletList(item?.bullets || []).some((line) => {
      const key = normalizeCompareKey(line);
      return key.length >= 12 && projectBulletKeys.has(key);
    });
    return !overlap;
  });
}

export function parseTextToModel(text) {
  const model = buildEmptyModel();
  const lines = splitTextLines(text);
  const nameLine = lines.find((line) => {
    const value = line.replace(/^姓名[:：]?\s*/i, "").trim();
    if (!value) return false;
    if (isContactOrProfileLine(value)) return false;
    if (isAnySectionHeadingLine(value)) return false;
    return /^[\u4e00-\u9fa5A-Za-z·\s]{2,30}$/.test(value);
  });
  if (nameLine) {
    model.basic.name = buildEmptyField({
      value: nameLine.replace(/^姓名[:：]?\s*/i, "").trim(),
      source: FIELD_SOURCES.PARSED_EXACT,
      confidence: 1
    });
  }

  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (email?.length) {
    model.basic.email = buildEmptyField({
      value: email[0],
      source: FIELD_SOURCES.PARSED_EXACT,
      confidence: 1
    });
  }
  const phone = text.match(/(?:\+?86[-\s]?)?1[3-9]\d{9}/);
  if (phone) {
    model.basic.phone = buildEmptyField({
      value: phone[0],
      source: FIELD_SOURCES.PARSED_EXACT,
      confidence: 1
    });
  }

  const titleMatch = text.match(/(?:职位|求职方向|目标岗位)[:：]\s*(.+)/);
  model.basic.title = buildEmptyField({
    value: titleMatch?.[1]?.trim() || "",
    source: FIELD_SOURCES.PARSED_EXACT,
    confidence: 1
  });

  const summaryLines = lines
    .filter((line) => !isAnySectionHeadingLine(line))
    .filter((line) => !isContactOrProfileLine(line))
    .slice(1, 5);
  model.basic.summary = buildEmptyField({
    value: summaryLines.join("，").slice(0, 240),
    source: FIELD_SOURCES.PARSED_EXACT,
    confidence: 1
  });

  const projects = extractProjectsFromText(text);
  const experience = extractExperienceFromText(text);
  model.projects = projects;
  model.experience = dedupeExperienceAgainstProjects(experience, projects);
  model.education = extractEducationFromText(text);
  model.skills = extractSkillsFromText(text);
  model.custom_sections = [
    {
      title: "个人优势",
      content: "结果导向，能够在资源约束下推进交付并持续优化。",
      items: ["结果导向，能够在资源约束下推进交付并持续优化。"]
    }
  ];
  model.render_config = {
    ...model.render_config,
    template: "",
    pages: 1
  };

  return normalizeReactiveJson(model);
}

function extractExperienceFromText(text) {
  const sectionText = extractSectionText(text, SECTION_HEADINGS.experience);
  if (!sectionText) {
    return [];
  }
  const blocks = splitSectionBlocks(sectionText);
  const records = [];
  for (const block of blocks) {
    const lines = mergeWrappedLines(
      splitTextLines(block)
        .map(stripLeadingMarker)
        .filter(Boolean)
        .filter((line) => !isAnySectionHeadingLine(line))
        .filter((line) => !isContactOrProfileLine(line))
    );
    if (!lines.length) continue;
    const header = lines[0];
    const { company, role } = parseExperienceHeader(header);
    const dateRange = extractDateRangeFromLines(lines);
    const bullets = dedupeStringList(
      lines
        .slice(1)
        .filter((line) => line !== dateRange.line)
        .map(stripLeadingMarker)
        .filter((line) => line.length >= 4)
    ).slice(0, 6);
    if (!company && !role && !bullets.length) continue;
    records.push({
      company,
      role,
      start_date: dateRange.start,
      end_date: dateRange.end,
      start: dateRange.start,
      end: dateRange.end,
      bullets
    });
  }
  return records.slice(0, 6);
}

function extractProjectsFromText(text) {
  const sectionText = extractSectionText(text, SECTION_HEADINGS.projects);
  if (!sectionText) {
    return [];
  }
  const blocks = splitSectionBlocks(sectionText);
  const records = [];
  const seen = new Set();
  for (const block of blocks) {
    const lines = mergeWrappedLines(
      splitTextLines(block)
        .map(stripLeadingMarker)
        .filter(Boolean)
        .filter((line) => !isAnySectionHeadingLine(line))
        .filter((line) => !isContactOrProfileLine(line))
    );
    if (!lines.length) continue;
    const rawName = lines[0]
      .replace(/^项目[一二三四五六七八九十\d]*[:：\-]?\s*/i, "")
      .replace(/^\d+[.)、]\s*/, "")
      .replace(new RegExp(`\\s*${DATE_RANGE_PATTERN.source}\\s*$`, "i"), "")
      .trim();
    const name = rawName || `项目 ${records.length + 1}`;
    const nameKey = normalizeCompareKey(name);
    if (nameKey && seen.has(nameKey)) continue;
    seen.add(nameKey);
    const dateRange = extractDateRangeFromLines(lines);
    const bullets = dedupeStringList(
      lines
        .slice(1)
        .filter((line) => line !== dateRange.line)
        .filter((line) => !/^[^。！？]{1,20}[:：]$/.test(line))
        .flatMap((line) => normalizeBulletList(line))
    ).slice(0, 6);
    records.push({
      name,
      role: "",
      start_date: dateRange.start,
      end_date: dateRange.end,
      start: dateRange.start,
      end: dateRange.end,
      bullets,
      technologies: []
    });
  }
  return records.slice(0, 8);
}

function extractEducationFromText(text) {
  const sectionText = extractSectionText(text, SECTION_HEADINGS.education);
  if (!sectionText) {
    return [];
  }
  const lines = mergeWrappedLines(
    splitTextLines(sectionText)
      .map(stripLeadingMarker)
      .filter(Boolean)
      .filter((line) => !isAnySectionHeadingLine(line))
      .filter((line) => !isContactOrProfileLine(line))
  );
  const blocks = [];
  let current = [];
  const isSchoolLine = (line) => /(大学|学院|学校|University|College|Institute)/i.test(line);
  for (const line of lines) {
    if (isSchoolLine(line) && current.some(isSchoolLine)) {
      blocks.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length) {
    blocks.push(current);
  }

  const seen = new Set();
  return blocks
    .map((block) => {
      const schoolLine = block.find((line) => isSchoolLine(line)) || block[0] || "";
      const dateRange = extractDateRangeFromLines(block);
      const merged = block.join(" ");
      const schoolMatch = schoolLine.match(/^(.+?(?:大学|学院|学校|University|College|Institute))/i);
      const school = schoolMatch?.[1]?.trim() || schoolLine.trim();
      const degreeMatch = merged.match(/博士研究生|硕士研究生|硕士|本科|学士|专科|大专|中专|高中/);
      const degree = degreeMatch?.[0] || "";
      const majorByLabel = merged.match(/(?:专业|方向)[:：]?\s*([^\s,，|｜;；]+)/);
      const schoolTail = schoolLine
        .replace(school, "")
        .replace(new RegExp(DATE_RANGE_PATTERN.source, "gi"), "")
        .replace(/[·•|｜]/g, " ")
        .trim();
      const majorRaw = majorByLabel?.[1] || schoolTail.replace(degree, "").trim() || merged.replace(school, "").replace(degree, "").replace(dateRange.line, "");
      const major = majorRaw.replace(/[，,;；|｜]/g, " ").trim().split(/\s+/).slice(0, 6).join(" ");
      return {
        school: school.trim(),
        degree: degree.trim(),
        major: major.trim(),
        start_date: dateRange.start,
        end_date: dateRange.end,
        start: dateRange.start,
        end: dateRange.end,
        gpa: ""
      };
    })
    .filter((item) => item.school)
    .filter((item) => {
      const key = normalizeCompareKey(`${item.school}${item.degree}${item.major}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function extractSkillsFromText(text) {
  const sectionText = extractSectionText(text, SECTION_HEADINGS.skills);
  if (!sectionText) {
    return [];
  }
  const lines = splitTextLines(sectionText)
    .map(stripLeadingMarker)
    .filter(Boolean)
    .filter((line) => !isAnySectionHeadingLine(line))
    .filter((line) => !isContactOrProfileLine(line));

  const grouped = [];
  const mergeGroup = (category, items) => {
    const normalizedCategory = String(category || "").trim() || "核心技能";
    const existing = grouped.find((entry) => entry.category === normalizedCategory);
    if (existing) {
      existing.items.push(...items);
      return;
    }
    grouped.push({
      category: normalizedCategory,
      items: [...items]
    });
  };
  const fallbackItems = [];
  let pendingCategory = "";
  for (const line of lines) {
    const titleOnly = line.match(/^([A-Za-z\u4e00-\u9fa5][^:：]{0,18})[:：]\s*$/);
    if (titleOnly) {
      pendingCategory = titleOnly[1].trim();
      continue;
    }

    const proficiencyMatch = line.match(/^(熟悉|熟练|掌握|了解)[:：]\s*(.+)$/);
    if (proficiencyMatch && pendingCategory) {
      mergeGroup(pendingCategory, splitSkillItems(proficiencyMatch[2]));
      continue;
    }

    const categoryMatch = line.match(/^([A-Za-z\u4e00-\u9fa5][^:：]{0,18})[:：]\s*(.+)$/);
    if (categoryMatch) {
      const category = categoryMatch[1].trim();
      const items = splitSkillItems(categoryMatch[2]);
      if (items.length) {
        mergeGroup(category, items);
      }
      pendingCategory = category;
      continue;
    }
    const inlineItems = splitSkillItems(line);
    if (inlineItems.length && pendingCategory) {
      mergeGroup(pendingCategory, inlineItems);
      continue;
    }
    fallbackItems.push(...inlineItems);
  }

  const fallback = dedupeStringList(fallbackItems);
  if (fallback.length) {
    grouped.push({
      category: grouped.length ? "其他技能" : "核心技能",
      items: fallback
    });
  }

  return grouped
    .map((group) => ({
      category: group.category || "核心技能",
      items: dedupeStringList(group.items).map((name) => ({ name }))
    }))
    .filter((group) => group.items.length)
    .slice(0, 8);
}

export async function parseInput(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".json") {
    return normalizeReactiveJson(readJson(inputPath));
  }
  if (ext === ".pdf") {
    const content = await parsePdfToText(inputPath);
    return parseTextToModel(content);
  }
  return parseTextToModel(readText(inputPath));
}

function assertScoreBounds(value, fieldName, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`[SCHEMA] Field '${fieldName}' must be number in [${min}, ${max}]`);
  }
}

function modelWrapperSchemaOrThrow(report, taskName) {
  if (!report || typeof report !== "object") {
    throw new Error(`[SCHEMA] ${taskName} output must be an object`);
  }
  const model = report.model;
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    throw new Error(`[SCHEMA] ${taskName}.model must be an object`);
  }
  const confidence = report.confidence;
  if (confidence !== undefined) {
    assertScoreBounds(Number(confidence), `${taskName}.confidence`, 0, 1);
  }
  return { model, confidence: confidence === undefined ? null : Number(confidence) };
}

function parseModelWrapperSchemaOrThrow(report) {
  const normalized = modelWrapperSchemaOrThrow(report, "parse");
  const model = normalized.model;
  const basicSource =
    model?.basic ||
    model?.personalInfo ||
    model?.personal_info ||
    model?.basicInfo ||
    model?.basic_info ||
    {};
  const name = String(basicSource?.name || basicSource?.fullName || basicSource?.full_name || basicSource?.姓名 || "").trim();
  const email = String(basicSource?.email || basicSource?.邮箱 || "").trim();
  const phone = String(basicSource?.phone || basicSource?.tel || basicSource?.mobile || basicSource?.电话 || basicSource?.手机 || "").trim();

  if (!name || (!email && !phone)) {
    throw new Error("[SCHEMA] parse output must include name + one contact (email/phone)");
  }

  return normalized;
}

async function parseModelByAI(resumeText, options) {
  const prompt = {
    task: "parse",
    prompt_version: options.promptVersion,
    requirements: {
      output: "{ model: ParsedResumeLike, confidence?: 0-1 }",
      forbid: "markdown|code_fence|explanations",
      model_schema_hint: PARSED_RESUME_SCHEMA_HINT
    },
    resume_text: String(resumeText || "")
  };

  const { normalized } = await runAiWithSchemaRecovery(
    "parse",
    options,
    prompt,
    { name: "cn_resume_parse_model_wrapper", schema: MODEL_WRAPPER_JSON_SCHEMA },
    (rawReport) => parseModelWrapperSchemaOrThrow(rawReport)
  );
  return normalizeReactiveJson(normalized.model);
}

function buildVisionUserContent(promptPayload, pageDataUrls) {
  const parts = [];
  for (const url of pageDataUrls) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  parts.push({ type: "text", text: JSON.stringify(promptPayload) });
  return parts;
}

async function parseModelByAIVision(pageDataUrls, options) {
  const basePrompt: any = {
    task: "parse",
    prompt_version: options.promptVersion,
    requirements: {
      output: "{ model: ParsedResumeLike, confidence?: 0-1 }",
      forbid: "markdown|code_fence|explanations",
      model_schema_hint: PARSED_RESUME_SCHEMA_HINT
    },
    resume_images: {
      page_count: Array.isArray(pageDataUrls) ? pageDataUrls.length : 0
    }
  };

  let prompt: any = basePrompt;
  let lastSchemaError = null;
  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    const aiReport = await callAiJson(
      "parse",
      options,
      prompt,
      { name: "cn_resume_parse_model_wrapper", schema: MODEL_WRAPPER_JSON_SCHEMA },
      buildVisionUserContent(prompt, pageDataUrls)
    );
    try {
      const normalized = parseModelWrapperSchemaOrThrow(aiReport);
      return normalizeReactiveJson(normalized.model);
    } catch (error) {
      lastSchemaError = error;
      if (attempt >= AI_MAX_ATTEMPTS) {
        break;
      }
      prompt = {
        ...basePrompt,
        schema_repair: {
          attempt: attempt + 1,
          reason: String(error?.message || error),
          previous_output: aiReport
        }
      };
    }
  }

  throw new Error(
    `[SCHEMA] parse response invalid after ${AI_MAX_ATTEMPTS} attempts: ${String(lastSchemaError?.message || lastSchemaError)}`
  );
}

export async function parseInputByAI(inputPath, options) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".json") {
    return normalizeReactiveJson(readJson(inputPath));
  }
  if (ext === ".pdf") {
    const { text, images } = await loadPdfForAiParsing(inputPath);
    if (!images.length) {
      return parseModelByAI(text, options);
    }
    return parseModelByAIVision(images, options);
  }
  const content = readText(inputPath);
  const trimmed = String(content || "").trim();
  if (!trimmed) {
    throw new Error("parse requires non-empty input");
  }
  return parseModelByAI(trimmed, options);
}

function readJdKeywords(jdText) {
  const candidates = jdText
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9_#+.-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  const counts = new Map();
  for (const token of candidates) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([word]) => word);
}

function cleanBulletText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/(?:，|\s)*(?:覆盖[^，。；;]{0,24}要求|产出可衡量结果并形成稳定流程)\s*$/g, "")
    .trim();
}

function isMeaningfulBullet(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  if (normalized.length < 4) return false;
  if (/^[^。！？]{1,20}[:：]$/.test(normalized)) return false;
  if (isContactOrProfileLine(normalized)) return false;
  if (/^(?:姓名|邮箱|电话|手机|微信|qq|github|linkedin|地址|住址)/i.test(normalized)) return false;
  return true;
}

function rewriteBullet(text) {
  const normalized = cleanBulletText(text);
  if (!normalized) {
    return "";
  }
  if (!isMeaningfulBullet(normalized)) {
    return "";
  }
  return normalized;
}

export function optimizeModel(model, jdText = "", feedbackText = "") {
  const output = structuredClone(model);
  const jdKeywords = jdText ? readJdKeywords(jdText) : [];
  const feedbackKeywords = feedbackText ? readJdKeywords(feedbackText).slice(0, 12) : [];

  output.experience = (output.experience || []).map((exp) => {
    const sourceBullets = normalizeBulletList(exp.bullets)
      .map(cleanBulletText)
      .filter(isMeaningfulBullet)
      .slice(0, 8);
    const rewritten = sourceBullets.map((line) => rewriteBullet(line)).filter(Boolean);
    return {
      ...exp,
      bullets: dedupeStringList(rewritten).slice(0, 5)
    };
  });

  output.projects = (output.projects || []).map((proj) => ({
    ...proj,
    bullets: dedupeStringList(
      normalizeBulletList([...(normalizeBulletList(proj.bullets || [])), getFieldValue(proj.description)])
        .map(cleanBulletText)
        .filter(isMeaningfulBullet)
        .map((line) => rewriteBullet(line))
        .filter(Boolean)
    ).slice(0, 5)
  }));
  output.experience = dedupeExperienceAgainstProjects(output.experience, output.projects);

  if (!output.custom_sections || !output.custom_sections.length) {
    output.custom_sections = [];
  }
  output.custom_sections = [
    ...output.custom_sections.filter((s) => s?.title !== "个人优势"),
    {
      title: "个人优势",
      content:
        "具备从需求拆解到结果复盘的闭环能力，能在不确定环境下持续交付。\n重视工程质量与效率，关注可维护性、稳定性与业务价值。",
      items: [
        "具备从需求拆解到结果复盘的闭环能力，能在不确定环境下持续交付。",
        "重视工程质量与效率，关注可维护性、稳定性与业务价值。"
      ]
    }
  ];

  output.meta = {
    ...(output.meta || {}),
    optimized_at: nowIso(),
    optimize_notes: {
      jd_keywords: jdKeywords.slice(0, 20),
      feedback_keywords: feedbackKeywords,
      feedback_prompt: PHASE_B_PROMPT
    }
  };

  return output;
}

export async function optimizeModelByAI(model, jdText, feedbackText, options) {
  const prompt = {
    task: "optimize",
    prompt_version: options.promptVersion,
    constraints: {
      no_fabrication: true,
      no_template_filler: true,
      keep_contact: true,
      prefer_action_result: true
    },
    jd_text: jdText || "",
    feedback_text: feedbackText || "",
    resume: model
  };

  const { normalized } = await runAiWithSchemaRecovery(
    "optimize",
    options,
    prompt,
    { name: "cn_resume_optimize_model_wrapper", schema: MODEL_WRAPPER_JSON_SCHEMA },
    (rawReport) => modelWrapperSchemaOrThrow(rawReport, "optimize")
  );

  const merged = normalizeReactiveJson({ ...structuredClone(model), ...normalized.model });
  merged.experience = (merged.experience || []).map((exp) => ({
    ...exp,
    bullets: dedupeStringList(
      normalizeBulletList(exp.bullets)
        .map(cleanBulletText)
        .filter(isMeaningfulBullet)
    ).slice(0, 6)
  }));
  merged.projects = (merged.projects || []).map((proj) => ({
    ...proj,
    bullets: dedupeStringList(
      normalizeBulletList([...(normalizeBulletList(proj.bullets || [])), getFieldValue(proj.description)])
        .map(cleanBulletText)
        .filter(isMeaningfulBullet)
    ).slice(0, 6)
  }));
  merged.experience = dedupeExperienceAgainstProjects(merged.experience, merged.projects);
  return merged;
}

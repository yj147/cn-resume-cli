import { normalizeBulletList } from "../core/model.js";
import { getFieldValue } from "../core/provenance.js";
import { BUILTIN_TEMPLATE_NAMES, resolveTemplateSpec } from "./spec.js";

const ATS_SAFE_TEMPLATES = new Set(["single-ats", "split-ats", "compact-ats"]);
const DENSE_SAFE_TEMPLATES = new Set(["compact-clean", "compact-ats", "single-minimal", "single-ats"]);
const DESIGN_TEMPLATES = new Set(["single-accent", "timeline-accent", "editorial-accent"]);
const ENGINEERING_TEMPLATES = new Set(["single-clean", "split-clean", "split-dark", "sidebar-clean", "sidebar-dark"]);

function positiveInt(value, fallback = 1) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return fallback;
  }
  return Math.round(normalized);
}

function textValue(field) {
  if (typeof field === "string") {
    return field.trim();
  }
  return String(getFieldValue(field) || "").trim();
}

function collectBullets(model) {
  const experienceBullets = (model?.experience || []).flatMap((item) => normalizeBulletList(item?.bullets || []));
  const projectBullets = (model?.projects || []).flatMap((item) => normalizeBulletList(item?.bullets || []));
  return [...experienceBullets, ...projectBullets];
}

function collectTextLength(model, bullets) {
  const summary = textValue(model?.basic?.summary);
  const title = textValue(model?.basic?.title);
  const skills = JSON.stringify(model?.skills || []);
  return `${summary} ${title} ${skills} ${bullets.join(" ")}`.trim().length;
}

function normalizeKeywords(input) {
  return (Array.isArray(input) ? input : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function hasAny(text, patterns) {
  const normalized = String(text || "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function detectOverflowRisk(reviewResult) {
  const findings = Array.isArray(reviewResult?.findings) ? reviewResult.findings : [];
  return findings.some((item) => {
    const category = String(item?.category || "");
    const message = String(item?.message || "");
    return category === "layout_quality" && /超页|一页|版面/.test(message);
  });
}

export function collectRecommendationSignals(input: Record<string, any> = {}) {
  const model = input.model || {};
  const preferences = input.preferences || {};
  const bullets = collectBullets(model);
  const textLength = collectTextLength(model, bullets);
  const bulletCount = bullets.length;
  const contentDensityScore = bulletCount * 120 + textLength;
  const contentDensity =
    contentDensityScore >= 2200 || bulletCount >= 10
      ? "high"
      : contentDensityScore >= 1200 || bulletCount >= 5
        ? "medium"
        : "low";
  const targetRole = String(preferences.targetRole || textValue(model?.basic?.title) || "").trim();
  const preferenceKeywords = normalizeKeywords(preferences.preferenceKeywords);
  const pageGoal = positiveInt(preferences.pageGoal || model?.render_config?.pages || 1, 1);
  const atsPreferred =
    Boolean(preferences.atsPreferred) ||
    preferenceKeywords.some((keyword) => /ats/i.test(keyword));
  const overflowRisk = detectOverflowRisk(input.reviewResult);
  const keywordText = `${targetRole} ${preferenceKeywords.join(" ")}`.toLowerCase();

  return {
    contentDensity: {
      level: contentDensity,
      bulletCount,
      textLength,
      score: contentDensityScore
    },
    targetRole,
    preferenceKeywords,
    pageGoal,
    atsPreferred,
    overflowRisk,
    designFocus: hasAny(keywordText, ["设计", "ui", "ux", "视觉", "创意", "作品"]),
    engineeringFocus: hasAny(keywordText, ["开发", "工程", "后端", "前端", "全栈", "平台", "架构", "技术"])
  };
}

function scoreTemplate(templateId, signals) {
  let score = 0;
  const spec = resolveTemplateSpec(templateId);

  if (signals.pageGoal === 1 && DENSE_SAFE_TEMPLATES.has(templateId)) {
    score += templateId.startsWith("compact-") ? 6 : templateId.endsWith("-ats") ? 5 : 3;
  }
  if (signals.contentDensity.level === "high" && DENSE_SAFE_TEMPLATES.has(templateId)) {
    score += templateId.startsWith("compact-") ? 5 : templateId.endsWith("-ats") ? 4 : 2;
  }
  if (signals.overflowRisk && DENSE_SAFE_TEMPLATES.has(templateId)) {
    score += templateId.startsWith("compact-") ? 5 : templateId.endsWith("-ats") ? 4 : 1;
  }
  if (signals.atsPreferred && ATS_SAFE_TEMPLATES.has(templateId)) {
    score += templateId === "compact-ats" ? 6 : templateId === "split-ats" ? 5 : 4;
  }
  if (signals.designFocus) {
    if (templateId === "editorial-accent") score += 12;
    else if (templateId === "timeline-accent") score += 10;
    else if (templateId === "single-accent") score += 8;
    else if (DESIGN_TEMPLATES.has(templateId)) score += 4;
  }
  if (signals.engineeringFocus && ENGINEERING_TEMPLATES.has(templateId)) {
    score += templateId.startsWith("split-") ? 6 : 4;
  }
  if (signals.pageGoal >= 2) {
    if (templateId === "single-minimal") score += 4;
    if (templateId === "single-clean") score += 1;
    if (spec.layoutFamily === "two-column" && !signals.atsPreferred) score += 1;
  }
  if (signals.preferenceKeywords.some((keyword) => /创意|视觉|作品/.test(keyword))) {
    if (templateId === "editorial-accent") score += 3;
    if (templateId === "timeline-accent") score += 2;
  }
  if (signals.preferenceKeywords.some((keyword) => /稳重|简洁|保守|ats/i.test(keyword))) {
    if (templateId.endsWith("-ats") || templateId.endsWith("-clean") || templateId.endsWith("-formal")) score += 2;
  }

  if (score === 0) {
    if (templateId === "single-clean") score = 3;
    else if (templateId === "single-formal") score = 2;
    else if (templateId === "split-clean") score = 1;
  }

  return score;
}

function buildReasons(templateId, signals) {
  const reasons = [];
  const spec = resolveTemplateSpec(templateId);

  if (signals.contentDensity.level === "high" && DENSE_SAFE_TEMPLATES.has(templateId)) {
    reasons.push("当前内容密度偏高，先看更稳的紧凑版式。");
  }
  if (signals.overflowRisk && DENSE_SAFE_TEMPLATES.has(templateId)) {
    reasons.push("审核已提示超页风险，这个模板更适合先控制页数。");
  }
  if (signals.atsPreferred && ATS_SAFE_TEMPLATES.has(templateId)) {
    reasons.push("你偏向 ATS 友好输出，这个模板结构更保守。");
  }
  if (signals.designFocus && templateId === "editorial-accent") {
    reasons.push("偏好词强调视觉表达，editorial 风格更适合做作品化展示。");
  }
  if (signals.designFocus && templateId === "timeline-accent") {
    reasons.push("你更关注时间线叙事，这个模板更适合突出履历节奏。");
  }
  if (signals.engineeringFocus && templateId.startsWith("split-")) {
    reasons.push("岗位目标偏工程交付，这个模板更接近技术岗位语境。");
  }
  if (signals.pageGoal >= 2 && templateId === "single-minimal") {
    reasons.push("页数目标放宽后，minimal 更容易稳住长文案可读性。");
  }
  if (!reasons.length) {
    reasons.push(
      spec.layoutFamily === "two-column"
        ? "双栏结构便于把辅助信息收进侧栏，减少主叙事干扰。"
        : "单栏阅读路径更直接，适合作为默认候选先比较。"
    );
  }

  return reasons;
}

function buildRisks(templateId, signals) {
  const spec = resolveTemplateSpec(templateId);

  if (DESIGN_TEMPLATES.has(templateId)) {
    return ["设计感更强，正式/ATS 场景下会比经典模板更激进。"] as string[];
  }
  if (ATS_SAFE_TEMPLATES.has(templateId)) {
    return ["版式更保守，视觉个性会弱于更强调风格的模板。"] as string[];
  }
  if (spec.layoutFamily === "two-column") {
    return ["双栏模板更依赖真实内容预览，内容继续增长时需要额外留意分页。"] as string[];
  }
  if (signals.pageGoal === 1 && signals.contentDensity.level !== "low") {
    return ["如果内容继续增长，仍可能逼近一页上限。"] as string[];
  }
  return ["仍需结合真实内容预览确认最终观感。"] as string[];
}

export function recommendTemplates(input: Record<string, any> = {}) {
  const limit = positiveInt(input.limit, 3);
  const signals = collectRecommendationSignals(input);
  const ranked = BUILTIN_TEMPLATE_NAMES
    .map((templateId) => ({
      templateId,
      score: scoreTemplate(templateId, signals)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return BUILTIN_TEMPLATE_NAMES.indexOf(left.templateId) - BUILTIN_TEMPLATE_NAMES.indexOf(right.templateId);
    })
    .slice(0, limit)
    .map((candidate) => ({
      ...candidate,
      reasons: buildReasons(candidate.templateId, signals),
      risks: buildRisks(candidate.templateId, signals)
    }));

  return {
    signals,
    candidates: ranked
  };
}

import fs from "node:fs";
import { collectCustomSectionLines, normalizeBulletList } from "../core/model.js";
import { getFieldValue } from "../core/provenance.js";

export const LAYOUT_DECISION_OPTIONS = Object.freeze([
  {
    id: "accept_multipage",
    label: "保留多页"
  },
  {
    id: "switch_compact_template",
    label: "切紧凑模板"
  },
  {
    id: "generate_compaction_patch",
    label: "生成压缩 patch"
  }
]);

const LAYOUT_DECISION_OPTION_IDS = new Set(LAYOUT_DECISION_OPTIONS.map((option) => option.id));

function positiveNumber(value, fallback = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}

function normalizeLayoutStatus(input) {
  const status = String(input || "").trim().toLowerCase();
  if (status === "overflow" || status === "multipage") {
    return "overflow";
  }
  if (status === "needs_attention") {
    return "needs_attention";
  }
  return status || "ready";
}

function normalizeTemplateId(input) {
  return String(input || "").trim();
}

function projectBodyLines(project) {
  const description = getFieldValue(project?.description).trim();
  const bullets = normalizeBulletList(project?.bullets || []).filter((line) => line !== description);
  return {
    description,
    bullets
  };
}

export function normalizeLayoutResult(layoutResult) {
  if (!layoutResult || typeof layoutResult !== "object") {
    return null;
  }

  const status = normalizeLayoutStatus(layoutResult.status);
  const templateId = normalizeTemplateId(layoutResult.templateId || layoutResult.template || layoutResult.selectedTemplateId);
  const selectedOption = String(layoutResult.selectedOption || "").trim();
  const isKnownOption = LAYOUT_DECISION_OPTION_IDS.has(selectedOption);
  const requiresDecision = status === "overflow";
  const confirmed = requiresDecision
    ? isKnownOption && selectedOption === "accept_multipage" && layoutResult.confirmed !== false
    : Boolean(layoutResult.confirmed ?? true);
  const requiresFollowUp = requiresDecision && isKnownOption && selectedOption !== "accept_multipage";

  return {
    ...layoutResult,
    status,
    pageCount: positiveNumber(layoutResult.pageCount, requiresDecision ? 2 : 1) || (requiresDecision ? 2 : 1),
    options: requiresDecision ? LAYOUT_DECISION_OPTIONS : [],
    templateId,
    selectedOption: isKnownOption ? selectedOption : "",
    confirmed,
    stable: layoutResult.stable === true,
    requiresDecision: requiresDecision && !isKnownOption,
    requiresFollowUp,
    finding: layoutResult.finding && typeof layoutResult.finding === "object" ? layoutResult.finding : null,
    invalidatedBy: String(layoutResult.invalidatedBy || "").trim(),
    invalidatedAt: String(layoutResult.invalidatedAt || "").trim()
  };
}

export function invalidateLayoutResult(layoutResult, templateId, reason = "template_changed") {
  const normalized = normalizeLayoutResult(layoutResult);
  if (!normalized) {
    return null;
  }
  return normalizeLayoutResult({
    ...normalized,
    templateId: normalizeTemplateId(templateId) || normalized.templateId,
    stable: false,
    invalidatedBy: reason,
    invalidatedAt: new Date().toISOString()
  });
}

export function recordLayoutDecision(layoutResult, selectedOption) {
  const normalized = normalizeLayoutResult(layoutResult);
  const choice = String(selectedOption || "").trim();
  if (!normalized || normalized.status !== "overflow") {
    throw new Error("BLOCKED: no overflow layout decision pending");
  }
  if (!LAYOUT_DECISION_OPTION_IDS.has(choice)) {
    throw new Error(`BLOCKED: unsupported layout decision '${choice}'`);
  }
  return normalizeLayoutResult({
    ...normalized,
    selectedOption: choice,
    confirmed: choice === "accept_multipage",
    decidedAt: new Date().toISOString()
  });
}

export function assertLayoutExportReady(layoutResult, commandName = "export") {
  const normalized = normalizeLayoutResult(layoutResult);
  if (!normalized || normalized.status !== "overflow") {
    return normalized;
  }
  if (!normalized.selectedOption) {
    throw new Error(
      `BLOCKED: layout_decision_required. Choose accept_multipage, switch_compact_template, or generate_compaction_patch before ${commandName}.`
    );
  }
  if (normalized.selectedOption !== "accept_multipage") {
    throw new Error(`BLOCKED: layout_action_pending (${normalized.selectedOption}). Resolve layout before ${commandName}.`);
  }
  if (!normalized.confirmed) {
    throw new Error(`BLOCKED: layout_decision_required. Re-confirm multipage before ${commandName}.`);
  }
  return normalized;
}

export function modelToPlainText(model) {
  const formatDateRange = (item) => {
    const start = String(getFieldValue(item.start_date) || getFieldValue(item.start) || "").trim();
    const end = String(getFieldValue(item.end_date) || getFieldValue(item.end) || "").trim();
    if (start && end) {
      return `${start} - ${end}`;
    }
    return start || end || "";
  };

  const listifyCustomSection = (section) => {
    return collectCustomSectionLines(section).map((line) => `${section.title || "附加信息"}: ${line}`);
  };

  const out = [];
  const basic = model.basic || {};
  const basicName = getFieldValue(basic.name);
  const basicTitle = getFieldValue(basic.title);
  const basicPhone = getFieldValue(basic.phone);
  const basicEmail = getFieldValue(basic.email);
  const basicLocation = getFieldValue(basic.location);
  const basicWebsite = getFieldValue(basic.website);
  const basicSummary = getFieldValue(basic.summary);
  out.push(`${basicName || ""}`.trim());
  if (basicTitle) out.push(basicTitle);
  const contact = [basicPhone, basicEmail, basicLocation, basicWebsite].filter(Boolean).join(" | ");
  if (contact) out.push(contact);
  if (basicSummary) out.push(`\n${basicSummary}\n`);

  const dump = (title, lines) => {
    if (!lines.length) return;
    out.push(`== ${title} ==`);
    out.push(...lines);
    out.push("");
  };

  dump(
    "工作经历",
    (model.experience || [])
      .flatMap((exp) => [
        `- ${getFieldValue(exp.role) || ""} @ ${getFieldValue(exp.company) || ""}`.trim(),
        formatDateRange(exp) ? `  ${formatDateRange(exp)}` : "",
        ...normalizeBulletList(exp.bullets || []).map((b) => `  * ${b}`)
      ])
      .filter(Boolean)
  );
  dump(
    "项目经历",
    (model.projects || [])
      .flatMap((proj) => {
        const body = projectBodyLines(proj);
        return [
          `- ${getFieldValue(proj.name) || ""}`.trim(),
          formatDateRange(proj) ? `  ${formatDateRange(proj)}` : "",
          body.description ? `  ${body.description}` : "",
          ...body.bullets.map((b) => `  * ${b}`)
        ];
      })
      .filter(Boolean)
  );
  dump(
    "技能",
    (model.skills || []).map((group) => `- ${group.category}: ${(group.items || []).map((i) => i.name || i).join("、")}`)
  );
  dump(
    "教育经历",
    (model.education || []).map((edu) =>
      [
        `- ${getFieldValue(edu.school)} ${getFieldValue(edu.degree) || ""} ${getFieldValue(edu.major) || ""}`.trim(),
        formatDateRange(edu) ? `  ${formatDateRange(edu)}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    )
  );
  dump(
    "证书认证",
    (model.certifications || []).map((item) =>
      `- ${item.name || ""}${item.issuer ? ` (${item.issuer})` : ""}${item.date ? ` ${item.date}` : ""}`.trim()
    )
  );
  dump(
    "语言能力",
    (model.languages || []).map((item) => `- ${item.language || ""}${item.proficiency ? ` (${item.proficiency})` : ""}`.trim())
  );
  dump(
    "GitHub 项目",
    (model.github || []).map((item) => {
      const repoUrl = item.repo_url || item.repoUrl || "";
      const stars = Number.isFinite(Number(item.stars)) ? Number(item.stars) : 0;
      const starsText = stars > 0 ? ` ★${stars}` : "";
      return `- ${item.name || ""}${starsText}${repoUrl ? ` ${repoUrl}` : ""}`.trim();
    })
  );
  dump(
    "二维码链接",
    (model.qr_codes || []).map((item) => `- ${item.label || item.name || item.title || "链接"}: ${item.url || ""}`.trim())
  );
  dump(
    "附加信息",
    (model.custom_sections || []).flatMap((sec) => listifyCustomSection(sec).map((line) => `- ${line}`))
  );
  return `${out.join("\n")}\n`;
}

export async function generateDocx(model, outputPath) {
  let docx;
  try {
    docx = await import("docx");
  } catch {
    throw new Error("docx package is not installed. Run: npm install");
  }
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
  const children = [];
  const basic = model.basic || {};
  const basicName = getFieldValue(basic.name);
  const basicTitle = getFieldValue(basic.title);
  const basicPhone = getFieldValue(basic.phone);
  const basicEmail = getFieldValue(basic.email);
  const basicLocation = getFieldValue(basic.location);
  const basicWebsite = getFieldValue(basic.website);
  const basicSummary = getFieldValue(basic.summary);
  children.push(new Paragraph({ text: basicName || "候选人", heading: HeadingLevel.TITLE }));
  if (basicTitle) {
    children.push(new Paragraph({ text: basicTitle }));
  }
  const contactLine = [basicPhone, basicEmail, basicLocation, basicWebsite].filter(Boolean).join(" | ");
  if (contactLine) {
    children.push(new Paragraph({ text: contactLine }));
  }
  if (basicSummary) {
    children.push(new Paragraph({ text: basicSummary }));
  }

  const formatDateRange = (item) => {
    const start = String(getFieldValue(item.start_date) || getFieldValue(item.start) || "").trim();
    const end = String(getFieldValue(item.end_date) || getFieldValue(item.end) || "").trim();
    if (start && end) return `${start} - ${end}`;
    return start || end || "";
  };

  const addSection = (title, lines) => {
    if (!lines.length) return;
    children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }));
    for (const line of lines) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  };

  addSection(
    "工作经历",
    (model.experience || []).flatMap((exp) => {
      const header = `${getFieldValue(exp.role) || ""} @ ${getFieldValue(exp.company) || ""}`.trim();
      const dateLine = formatDateRange(exp);
      return [header, dateLine, ...normalizeBulletList(exp.bullets || []).map((x) => `• ${x}`)].filter(Boolean);
    })
  );
  addSection(
    "项目经历",
    (model.projects || []).flatMap((proj) => {
      const header = getFieldValue(proj.name).trim();
      const dateLine = formatDateRange(proj);
      const body = projectBodyLines(proj);
      return [header, dateLine, body.description, ...body.bullets.map((x) => `• ${x}`)].filter(Boolean);
    })
  );
  addSection(
    "技能",
    (model.skills || []).map((group) => `${group.category}: ${(group.items || []).map((i) => i.name || i).join("、")}`)
  );
  addSection(
    "教育经历",
    (model.education || []).flatMap((edu) => {
      const header = `${getFieldValue(edu.school) || ""} ${getFieldValue(edu.degree) || ""} ${getFieldValue(edu.major) || ""}`.trim();
      const dateLine = formatDateRange(edu);
      const description = getFieldValue(edu.description).trim();
      return [header, dateLine, description].filter(Boolean);
    })
  );
  addSection(
    "证书认证",
    (model.certifications || []).map((item) =>
      `${item.name || ""}${item.issuer ? ` (${item.issuer})` : ""}${item.date ? ` ${item.date}` : ""}`.trim()
    )
  );
  addSection(
    "语言能力",
    (model.languages || []).map((item) => `${item.language || ""}${item.proficiency ? ` (${item.proficiency})` : ""}`.trim())
  );
  addSection(
    "GitHub 项目",
    (model.github || []).map((item) => {
      const repoUrl = item.repo_url || item.repoUrl || "";
      const stars = Number(item.stars || 0);
      return `${item.name || ""}${stars > 0 ? ` ★${stars}` : ""}${repoUrl ? ` ${repoUrl}` : ""}`.trim();
    })
  );
  addSection(
    "二维码链接",
    (model.qr_codes || []).map((item) => `${item.label || item.name || item.title || "链接"}: ${item.url || ""}`.trim())
  );
  addSection(
    "附加信息",
    (model.custom_sections || []).flatMap((section) => {
      const rows = collectCustomSectionLines(section);
      return rows.map((line) => `${section.title || "附加信息"}: ${line}`);
    })
  );

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

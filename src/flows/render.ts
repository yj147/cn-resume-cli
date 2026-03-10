import fs from "node:fs";
import { normalizeBulletList } from "../core/model.js";

export function modelToPlainText(model) {
  const formatDateRange = (item) => {
    const start = String(item.start_date || item.start || "").trim();
    const end = String(item.end_date || item.end || "").trim();
    if (start && end) {
      return `${start} - ${end}`;
    }
    return start || end || "";
  };

  const listifyCustomSection = (section) => {
    const contentLines = normalizeBulletList(section.content || "");
    const itemLines = normalizeBulletList(section.items || []);
    const merged = [...itemLines, ...contentLines].filter(Boolean);
    return merged.map((line) => `${section.title || "附加信息"}: ${line}`);
  };

  const out = [];
  const basic = model.basic || {};
  out.push(`${basic.name || ""}`.trim());
  if (basic.title) out.push(basic.title);
  const contact = [basic.phone, basic.email, basic.location, basic.website].filter(Boolean).join(" | ");
  if (contact) out.push(contact);
  if (basic.summary) out.push(`\n${basic.summary}\n`);

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
        `- ${exp.role || ""} @ ${exp.company || ""}`.trim(),
        formatDateRange(exp) ? `  ${formatDateRange(exp)}` : "",
        ...normalizeBulletList(exp.bullets || []).map((b) => `  * ${b}`)
      ])
      .filter(Boolean)
  );
  dump(
    "项目经历",
    (model.projects || [])
      .flatMap((proj) => [
        `- ${proj.name || ""}`.trim(),
        formatDateRange(proj) ? `  ${formatDateRange(proj)}` : "",
        ...normalizeBulletList(proj.bullets || []).map((b) => `  * ${b}`)
      ])
      .filter(Boolean)
  );
  dump(
    "技能",
    (model.skills || []).map((group) => `- ${group.category}: ${(group.items || []).map((i) => i.name || i).join("、")}`)
  );
  dump(
    "教育经历",
    (model.education || []).map((edu) =>
      [`- ${edu.school} ${edu.degree || ""} ${edu.major || ""}`.trim(), formatDateRange(edu) ? `  ${formatDateRange(edu)}` : ""]
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
  children.push(new Paragraph({ text: basic.name || "候选人", heading: HeadingLevel.TITLE }));
  if (basic.title) {
    children.push(new Paragraph({ text: basic.title }));
  }
  const contactLine = [basic.phone, basic.email, basic.location, basic.website].filter(Boolean).join(" | ");
  if (contactLine) {
    children.push(new Paragraph({ text: contactLine }));
  }
  if (basic.summary) {
    children.push(new Paragraph({ text: basic.summary }));
  }

  const formatDateRange = (item) => {
    const start = String(item.start_date || item.start || "").trim();
    const end = String(item.end_date || item.end || "").trim();
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
      const header = `${exp.role || ""} @ ${exp.company || ""}`.trim();
      const dateLine = formatDateRange(exp);
      return [header, dateLine, ...normalizeBulletList(exp.bullets || []).map((x) => `• ${x}`)].filter(Boolean);
    })
  );
  addSection(
    "项目经历",
    (model.projects || []).flatMap((proj) => {
      const header = (proj.name || "").trim();
      const dateLine = formatDateRange(proj);
      const description = String(proj.description || "").trim();
      return [header, dateLine, description, ...normalizeBulletList(proj.bullets || []).map((x) => `• ${x}`)].filter(Boolean);
    })
  );
  addSection(
    "技能",
    (model.skills || []).map((group) => `${group.category}: ${(group.items || []).map((i) => i.name || i).join("、")}`)
  );
  addSection(
    "教育经历",
    (model.education || []).flatMap((edu) => {
      const header = `${edu.school || ""} ${edu.degree || ""} ${edu.major || ""}`.trim();
      const dateLine = formatDateRange(edu);
      const description = String(edu.description || "").trim();
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
      const rows = normalizeBulletList(section.items || []).concat(normalizeBulletList(section.content || ""));
      return rows.map((line) => `${section.title || "附加信息"}: ${line}`);
    })
  );

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}


import { buildRenderTree } from "../layout-core/render-tree.js";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function collectNodeText(node, lines = []) {
  if (!node || typeof node !== "object") {
    return lines;
  }
  if (node.content && typeof node.content === "object") {
    for (const value of Object.values(node.content)) {
      if (typeof value === "string" && value.trim()) {
        lines.push(value.trim());
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" && item.trim()) {
            lines.push(item.trim());
          }
        }
      }
    }
  }
  if (Array.isArray(node.runs)) {
    const text = node.runs.map((run) => String(run?.text || "").trim()).filter(Boolean).join("");
    if (text) {
      lines.push(text);
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectNodeText(child, lines);
    }
  }
  return lines;
}

function flattenSections(renderTree) {
  return [
    ...(renderTree?.regions?.sidebar?.sections || []),
    ...(renderTree?.regions?.main?.sections || [])
  ]
    .slice()
    .sort((left, right) => Number(left?.sortOrder || 0) - Number(right?.sortOrder || 0))
    .map((section) => ({
      sectionType: String(section?.sectionType || ""),
      title: String(section?.title?.text || section?.sectionType || ""),
      region: String(section?.region || "main"),
      preview: collectNodeText(section?.body).slice(0, 2).join(" / ")
    }));
}

export function generateThumbnail(input, renderTreeOverride = null) {
  const renderTree =
    renderTreeOverride && typeof renderTreeOverride === "object"
      ? renderTreeOverride
      : buildRenderTree(input);
  const sections = flattenSections(renderTree);
  const accentColor =
    String(renderTree?.decorations?.find((item) => item?.token?.name === "accent")?.token?.value || input?.templateSpec?.visualTokens?.accent || "");
  const layoutFamily = String(renderTree?.layoutFamily || input?.templateSpec?.layoutFamily || "single-column");

  const sectionHtml = sections
    .map(
      (section) => `<li data-section-type="${escapeHtml(section.sectionType)}" data-region="${escapeHtml(section.region)}">
        <strong>${escapeHtml(section.title)}</strong>
        <span>${escapeHtml(section.preview)}</span>
      </li>`
    )
    .join("");

  return {
    html: `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(renderTree?.title || "resume-thumbnail")}</title>
  <style>
    body { margin: 0; font-family: Inter, "Noto Sans SC", sans-serif; background: #f8fafc; }
    .thumbnail { width: 320px; min-height: 180px; box-sizing: border-box; border-top: 6px solid ${escapeHtml(accentColor || "#2563eb")}; padding: 12px; background: white; }
    .thumbnail[data-layout-family="two-column"] { display: grid; grid-template-columns: 0.9fr 1.4fr; gap: 10px; }
    .thumbnail h1 { margin: 0 0 8px; font-size: 16px; }
    .thumbnail ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .thumbnail li { display: grid; gap: 2px; font-size: 11px; color: #334155; }
    .thumbnail strong { color: #0f172a; }
  </style>
</head>
<body>
  <article class="thumbnail" data-template="${escapeHtml(renderTree?.template || "")}" data-layout-family="${escapeHtml(layoutFamily)}">
    <h1>${escapeHtml(renderTree?.title || "")}</h1>
    <ul>${sectionHtml}</ul>
  </article>
</body>
</html>`,
    renderTree,
    sections,
    accentColor,
    layoutFamily
  };
}

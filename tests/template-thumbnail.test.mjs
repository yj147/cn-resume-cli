import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const customTemplateModule = await import("../dist/template/custom-template.js");
const specModule = await import("../dist/template/spec.js");

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("renderTemplateThumbnail shares render tree truth with preview and pdf rendering", async () => {
  const model = customTemplateModule.createTemplatePreviewSample();
  model.basic.summary.value = "这是 thumbnail 与 preview/pdf 共用的真实内容摘要";

  const preview = await customTemplateModule.renderTemplate(model, "sidebar-clean", false);
  const pdf = await customTemplateModule.renderTemplate(model, "sidebar-clean", true);
  const thumbnail = await customTemplateModule.renderTemplateThumbnail(model, "sidebar-clean");

  assert.equal(preview.template, "sidebar-clean");
  assert.equal(pdf.template, "sidebar-clean");
  assert.equal(thumbnail.template, "sidebar-clean");
  assert.deepEqual(preview.renderTree, pdf.renderTree);
  assert.deepEqual(preview.renderTree, thumbnail.renderTree);
  assert.deepEqual(
    thumbnail.sections.map((section) => section.sectionType),
    [...thumbnail.renderTree.regions.sidebar.sections, ...thumbnail.renderTree.regions.main.sections]
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
      .map((section) => section.sectionType)
  );
  assert.match(thumbnail.html, /这是 thumbnail 与 preview\/pdf 共用的真实内容摘要/);
});

test("renderTemplateThumbnail follows TemplateSpec layout and accent tokens for each template", async () => {
  const model = customTemplateModule.createTemplatePreviewSample();

  const compact = await customTemplateModule.renderTemplateThumbnail(model, "compact-clean");
  const sidebar = await customTemplateModule.renderTemplateThumbnail(model, "sidebar-dark");
  const compactSpec = specModule.resolveTemplateSpec("compact-clean");
  const sidebarSpec = specModule.resolveTemplateSpec("sidebar-dark");

  assert.equal(compact.layoutFamily, compactSpec.layoutFamily);
  assert.equal(sidebar.layoutFamily, sidebarSpec.layoutFamily);
  assert.equal(compact.accentColor, compactSpec.visualTokens.accent);
  assert.equal(sidebar.accentColor, sidebarSpec.visualTokens.accent);
  assert.notEqual(compact.accentColor, sidebar.accentColor);
});

test("thumbnail pipeline source stays on shared render inputs instead of duplicating template maps", () => {
  const source = readSource("../src/template/thumbnail.ts");
  assert.match(source, /buildRenderTree/);
  assert.doesNotMatch(source, /buildClassicHtml|buildModernHtml|TEMPLATE_BUILDERS/);
});

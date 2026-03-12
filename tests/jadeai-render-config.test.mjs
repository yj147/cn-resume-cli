import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const adapterModule = await import("../dist/jadeai/adapter.js");
const builderModule = await import("../dist/jadeai/builders.js");
const modelModule = await import("../dist/core/model.js");
const utilsModule = await import("../dist/jadeai/utils.js");
const specModule = await import("../dist/template/spec.js");

function loadFixture(name) {
  const file = path.join(process.cwd(), "fixtures", name);
  return modelModule.normalizeReactiveJson(JSON.parse(fs.readFileSync(file, "utf8")));
}

function createBuilderInput(model, templateName) {
  return {
    document: adapterModule.modelToDocumentIR(model, templateName),
    templateSpec: specModule.resolveTemplateSpec(templateName),
    themeConfig: adapterModule.modelToThemeConfig(model, templateName),
    title: "render-check",
    language: "zh"
  };
}

test("empty render_config module arrays keep JadeAI body sections visible", async () => {
  const model = loadFixture("sample-resume.json");
  model.render_config.modules = [];
  model.render_config.module_order = [];

  const resume = adapterModule.modelToJadeResume(model, "elegant");
  const sectionTypes = utilsModule.visibleSections(resume).map((section) => section.type);
  const html = await builderModule.generateHtml(createBuilderInput(model, "elegant"), false);

  assert.deepEqual(sectionTypes.slice(0, 6), [
    "summary",
    "work_experience",
    "projects",
    "education",
    "skills",
    "custom"
  ]);
  assert.equal(sectionTypes.includes("qr_codes"), true);
  assert.match(html, /工作经历/);
  assert.match(html, /技能特长/);
});

test("explicit JadeAI module selection still controls visibility and order", () => {
  const model = loadFixture("sample-resume.json");
  model.render_config.modules = ["skills", "summary"];
  model.render_config.module_order = ["skills", "summary"];

  const resume = adapterModule.modelToJadeResume(model, "elegant");
  const sectionTypes = utilsModule.visibleSections(resume).map((section) => section.type);

  assert.deepEqual(sectionTypes, ["skills", "summary"]);
});

test("adapter emits document IR seed before building Jade resume sections", () => {
  const model = loadFixture("sample-resume.json");
  model.render_config.modules = ["skills", "summary"];
  model.render_config.module_order = ["skills", "summary"];

  const documentIr = adapterModule.modelToDocumentIR(model, "elegant");
  const visibleSectionTypes = documentIr.sections
    .filter((section) => section.content.visible)
    .map((section) => section.content.sectionType)
    .filter((type) => type !== "personal_info");
  const resume = adapterModule.modelToJadeResume(model, "elegant");

  assert.deepEqual(visibleSectionTypes, ["skills", "summary"]);
  assert.deepEqual(
    resume.sections.map((section) => section.type),
    documentIr.sections.map((section) => section.content.sectionType)
  );
});

test("custom sections dedupe overlapping items and content lines", async () => {
  const model = loadFixture("sample-resume.json");
  model.custom_sections = [
    {
      title: "个人优势",
      items: ["执行力强", "执行力强。"],
      content: "执行力强\n执行力强。"
    }
  ];

  const resume = adapterModule.modelToJadeResume(model, "elegant");
  const customSection = resume.sections.find((section) => section.type === "custom");
  const html = await builderModule.generateHtml(createBuilderInput(model, "elegant"), false);

  assert.deepEqual(
    customSection.content.items.map((item) => item.description),
    ["执行力强", "执行力强。"]
  );
  assert.equal((html.match(/个人优势/g) || []).length, 2);
});

test("builders consume document IR and template spec while preserving dark sidebar pdf styling", async () => {
  const model = loadFixture("sample-resume.json");
  const html = await builderModule.generateHtml(createBuilderInput(model, "sidebar"), true);

  assert.match(html, /linear-gradient\(90deg, #1e40af 35%, white 35%\)/);
  assert.match(html, /@page \{ margin: 0; \}/);
});

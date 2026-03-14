import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const adapterModule = await import("../dist/render-engine/adapter.js");
const builderModule = await import("../dist/render-engine/builders.js");
const modelModule = await import("../dist/core/model.js");
const utilsModule = await import("../dist/render-engine/utils.js");
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

test("empty render_config module arrays keep render-engine body sections visible", async () => {
  const model = loadFixture("sample-resume.json");
  model.render_config.modules = [];
  model.render_config.module_order = [];

  const resume = adapterModule.modelToRenderResume(model, "single-clean");
  const sectionTypes = utilsModule.visibleSections(resume).map((section) => section.type);
  const html = await builderModule.generateHtml(createBuilderInput(model, "single-clean"), false);

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

test("explicit render-engine module selection still controls visibility and order", () => {
  const model = loadFixture("sample-resume.json");
  model.render_config.modules = ["skills", "summary"];
  model.render_config.module_order = ["skills", "summary"];

  const resume = adapterModule.modelToRenderResume(model, "single-clean");
  const sectionTypes = utilsModule.visibleSections(resume).map((section) => section.type);

  assert.deepEqual(sectionTypes, ["skills", "summary"]);
});

test("adapter emits document IR seed before building render resume sections", () => {
  const model = loadFixture("sample-resume.json");
  model.render_config.modules = ["skills", "summary"];
  model.render_config.module_order = ["skills", "summary"];

  const documentIr = adapterModule.modelToDocumentIR(model, "single-clean");
  const visibleSectionTypes = documentIr.sections
    .filter((section) => section.content.visible)
    .map((section) => section.content.sectionType)
    .filter((type) => type !== "personal_info");
  const resume = adapterModule.modelToRenderResume(model, "single-clean");

  assert.deepEqual(visibleSectionTypes, ["skills", "summary"]);
  assert.deepEqual(
    resume.sections.map((section) => section.type),
    documentIr.sections.map((section) => section.content.sectionType)
  );
});

test("adapter keeps section payload for rendering while exposing finer pagination blocks", () => {
  const model = loadFixture("sample-resume.json");
  const documentIr = adapterModule.modelToDocumentIR(model, "single-clean");
  const workSection = documentIr.sections.find((section) => section.content.sectionType === "work_experience");
  const resume = adapterModule.modelToRenderResume(model, "single-clean");
  const workResumeSection = resume.sections.find((section) => section.type === "work_experience");

  assert.equal(workSection.children.length > 1, true);
  assert.equal(Array.isArray(workSection.content.payload.items), true);
  assert.equal(Array.isArray(workResumeSection.content.items), true);
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

  const resume = adapterModule.modelToRenderResume(model, "single-clean");
  const customSection = resume.sections.find((section) => section.type === "custom");
  const html = await builderModule.generateHtml(createBuilderInput(model, "single-clean"), false);

  assert.deepEqual(
    customSection.content.items.map((item) => item.description),
    ["执行力强", "执行力强。"]
  );
  assert.equal((html.match(/个人优势/g) || []).length, 2);
});

test("builders consume document IR and template spec while preserving dark sidebar pdf styling", async () => {
  const model = loadFixture("sample-resume.json");
  const html = await builderModule.generateHtml(createBuilderInput(model, "sidebar-dark"), true);

  assert.match(html, /linear-gradient\(90deg, #1e40af 35%, white 35%\)/);
  assert.match(html, /@page \{ margin: 0; \}/);
});

test("render-engine fails explicitly for unknown template instead of falling back", async () => {
  const model = loadFixture("sample-resume.json");

  assert.throws(
    () => adapterModule.modelToThemeConfig(model, "unknown-template"),
    /Unsupported render template 'unknown-template'/
  );

  await assert.rejects(
    builderModule.generateHtml({
      document: adapterModule.modelToDocumentIR(model, "single-clean"),
      templateSpec: { name: "unknown-template" },
      themeConfig: {},
      title: "render-check",
      language: "zh"
    }, false),
    /Unsupported render template 'unknown-template'/
  );
});

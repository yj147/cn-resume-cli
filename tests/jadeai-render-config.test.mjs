import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const adapterModule = await import("../dist/jadeai/adapter.js");
const builderModule = await import("../dist/jadeai/builders.js");
const modelModule = await import("../dist/core/model.js");
const utilsModule = await import("../dist/jadeai/utils.js");

function loadFixture(name) {
  const file = path.join(process.cwd(), "fixtures", name);
  return modelModule.normalizeReactiveJson(JSON.parse(fs.readFileSync(file, "utf8")));
}

test("empty render_config module arrays keep JadeAI body sections visible", async () => {
  const model = loadFixture("sample-resume.json");
  model.render_config.modules = [];
  model.render_config.module_order = [];

  const resume = adapterModule.modelToJadeResume(model, "elegant");
  const sectionTypes = utilsModule.visibleSections(resume).map((section) => section.type);
  const html = await builderModule.generateHtml(resume, false);

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
  const html = await builderModule.generateHtml(resume, false);

  assert.deepEqual(
    customSection.content.items.map((item) => item.description),
    ["执行力强", "执行力强。"]
  );
  assert.equal((html.match(/个人优势/g) || []).length, 2);
});

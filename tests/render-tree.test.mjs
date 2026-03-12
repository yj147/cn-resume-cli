import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const documentIrModule = await import("../dist/layout-core/document-ir.js");
const templateSpecModule = await import("../dist/template/spec.js");
const renderTreeModule = await import("../dist/layout-core/render-tree.js");

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function buildDocumentIR() {
  const summarySection = documentIrModule.createSectionBlock({
    id: "section-summary",
    sectionType: "summary",
    title: "个人简介",
    sortOrder: 2,
    blocks: [
      documentIrModule.createBlock({
        id: "summary-text",
        type: documentIrModule.BLOCK_TYPES.PARAGRAPH,
        content: {
          runs: [documentIrModule.createTextRun("五年后端经验")]
        }
      })
    ]
  });
  const skillsSection = documentIrModule.createSectionBlock({
    id: "section-skills",
    sectionType: "skills",
    title: "技能特长",
    sortOrder: 1,
    blocks: [
      documentIrModule.createBlock({
        id: "skills-group",
        type: documentIrModule.BLOCK_TYPES.GROUP,
        content: {
          label: "技术栈"
        },
        children: [
          documentIrModule.createBlock({
            id: "skills-text",
            type: documentIrModule.BLOCK_TYPES.PARAGRAPH,
            content: {
              runs: [documentIrModule.createTextRun("Node.js / Go / PostgreSQL")]
            }
          })
        ]
      })
    ]
  });
  return documentIrModule.createDocumentIR({
    id: "resume-ir",
    sections: [summarySection, skillsSection]
  });
}

test("render tree groups sections into layout regions and preserves title/body nodes", () => {
  const documentIR = buildDocumentIR();
  const templateSpec = templateSpecModule.resolveTemplateSpec("sidebar");
  const renderTree = renderTreeModule.buildRenderTree({
    document: documentIR,
    templateSpec,
    title: "张三-简历"
  });

  assert.equal(renderTree.layoutFamily, "two-column");
  assert.equal(renderTree.title, "张三-简历");
  assert.deepEqual(
    renderTree.regions.sidebar.sections.map((section) => section.sectionType),
    ["skills"]
  );
  assert.deepEqual(
    renderTree.regions.main.sections.map((section) => section.sectionType),
    ["summary"]
  );
  assert.equal(renderTree.regions.main.sections[0].title.text, "个人简介");
  assert.equal(renderTree.regions.sidebar.sections[0].body.children[0].type, renderTreeModule.RENDER_NODE_TYPES.GROUP);
});

test("render tree carries decoration tokens and pagination anchors", () => {
  const renderTree = renderTreeModule.buildRenderTree({
    document: buildDocumentIR(),
    templateSpec: templateSpecModule.resolveTemplateSpec("elegant"),
    title: "张三-简历"
  });

  assert.equal(renderTree.decorations[0].type, renderTreeModule.RENDER_NODE_TYPES.DECORATION);
  assert.equal(typeof renderTree.decorations[0].token.value, "string");
  const anchors = renderTree.regions.main.sections.flatMap((section) => section.paginationAnchors);
  assert.equal(anchors.length > 0, true);
  assert.equal(anchors[0].type, renderTreeModule.RENDER_NODE_TYPES.PAGINATION_ANCHOR);
});

test("render tree source stays free of html strings and chat/session coupling", () => {
  const source = readSource("../src/layout-core/render-tree.ts");
  assert.doesNotMatch(source, /<div|<section|<span/);
  assert.doesNotMatch(source, /src\/chat|pendingPlan|composerDraft|workflowState/);
});

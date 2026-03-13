import test from "node:test";
import assert from "node:assert/strict";

const documentIrModule = await import("../dist/layout-core/document-ir.js");

test("document IR keeps section order and block hierarchy stable", () => {
  const bulletItem = documentIrModule.createBlock({
    id: "item-1",
    type: documentIrModule.BLOCK_TYPES.LIST_ITEM,
    content: {
      runs: [documentIrModule.createTextRun("将平台响应时间降低 30%")]
    }
  });
  const listBlock = documentIrModule.createBlock({
    id: "list-1",
    type: documentIrModule.BLOCK_TYPES.LIST,
    children: [bulletItem]
  });
  const summarySection = documentIrModule.createSectionBlock({
    id: "section-summary",
    sectionType: "summary",
    title: "个人简介",
    sortOrder: 2,
    blocks: [
      documentIrModule.createBlock({
        id: "summary-1",
        type: documentIrModule.BLOCK_TYPES.PARAGRAPH,
        content: {
          runs: [documentIrModule.createTextRun("5 年全栈开发经验")]
        }
      })
    ]
  });
  const experienceSection = documentIrModule.createSectionBlock({
    id: "section-experience",
    sectionType: "experience",
    title: "工作经历",
    sortOrder: 1,
    blocks: [listBlock]
  });

  const documentIr = documentIrModule.createDocumentIR({
    id: "resume-ir",
    sections: [summarySection, experienceSection]
  });

  assert.deepEqual(
    documentIr.sections.map((section) => section.content.sectionType),
    ["experience", "summary"]
  );
  assert.equal(documentIr.sections[0].children[0].type, documentIrModule.BLOCK_TYPES.LIST);
  assert.equal(documentIr.sections[0].children[0].children[0].type, documentIrModule.BLOCK_TYPES.LIST_ITEM);
});

test("section block preserves payload separately from pagination children", () => {
  const section = documentIrModule.createSectionBlock({
    id: "section-work",
    sectionType: "work_experience",
    title: "工作经历",
    sortOrder: 1,
    payload: {
      items: [{ id: "work-1", company: "星海科技" }]
    },
    blocks: [
      documentIrModule.createBlock({
        id: "work-1-header",
        type: documentIrModule.BLOCK_TYPES.GROUP,
        content: {
          text: "工程师 @ 星海科技"
        }
      })
    ]
  });

  assert.deepEqual(section.content.payload, {
    items: [{ id: "work-1", company: "星海科技" }]
  });
  assert.equal(section.children.length, 1);
});

test("document IR preserves emphasis metadata without embedding html", () => {
  const run = documentIrModule.createTextRun("核心成果", {
    bold: true,
    italic: true
  });
  const paragraph = documentIrModule.createBlock({
    id: "paragraph-1",
    type: documentIrModule.BLOCK_TYPES.PARAGRAPH,
    content: {
      runs: [run]
    }
  });

  assert.deepEqual(run.emphasis, {
    bold: true,
    italic: true,
    underline: false
  });
  assert.equal(Object.hasOwn(paragraph.content, "html"), false);
});

test("document IR normalizes pagination constraints explicitly", () => {
  const constraints = documentIrModule.createBlockConstraints({
    keepTogether: true,
    allowSplit: false,
    minLinesAtBottom: 2,
    minLinesAtTop: 3,
    splitPriority: 9
  });
  const block = documentIrModule.createBlock({
    id: "constraint-1",
    type: documentIrModule.BLOCK_TYPES.PARAGRAPH,
    constraints
  });

  assert.deepEqual(block.constraints, {
    keepTogether: true,
    allowSplit: false,
    minLinesAtBottom: 2,
    minLinesAtTop: 3,
    splitPriority: 9
  });
});

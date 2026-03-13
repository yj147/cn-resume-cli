import test from "node:test";
import assert from "node:assert/strict";

const documentIrModule = await import("../dist/layout-core/document-ir.js");
const paginationModule = await import("../dist/layout-core/pagination.js");
const templateSpecModule = await import("../dist/template/spec.js");
const adapterModule = await import("../dist/jadeai/adapter.js");
const customTemplateModule = await import("../dist/template/custom-template.js");

function createLineBlock(id, lineCount, constraints = {}, type = documentIrModule.BLOCK_TYPES.PARAGRAPH) {
  return documentIrModule.createBlock({
    id,
    type,
    content: {
      lineCount,
      marker: id
    },
    constraints
  });
}

function createSection(id, sectionType, sortOrder, blocks) {
  return documentIrModule.createSectionBlock({
    id,
    sectionType,
    title: `${sectionType}-${sortOrder}`,
    sortOrder,
    blocks
  });
}

function buildDocument(sections) {
  return documentIrModule.createDocumentIR({
    id: "resume-pagination",
    sections
  });
}

function flattenRegionFragments(result, region) {
  return result.pages.flatMap((page) =>
    page.regions[region].map((fragment) => ({
      pageIndex: page.index,
      ...fragment
    }))
  );
}

function totalFragmentLines(result) {
  return result.pages.reduce((total, page) => {
    return total + ["main", "sidebar"].reduce((regionTotal, region) => {
      return (
        regionTotal +
        page.regions[region].reduce((fragmentTotal, fragment) => {
          return fragmentTotal + (fragment.lineEnd - fragment.lineStart + 1);
        }, 0)
      );
    }, 0);
  }, 0);
}

test("pagination keeps single-column content on one page when capacity is sufficient", () => {
  const result = paginationModule.paginateDocument({
    document: buildDocument([
      createSection("section-summary", "summary", 1, [
        createLineBlock("block-summary", 3),
        createLineBlock("block-work", 4)
      ])
    ]),
    templateSpec: templateSpecModule.resolveTemplateSpec("elegant"),
    pageBox: {
      linesPerPage: 10
    }
  });

  assert.equal(result.status, "single-page");
  assert.equal(result.pageCount, 1);
  assert.deepEqual(
    flattenRegionFragments(result, "main").map((fragment) => [fragment.blockId, fragment.pageIndex, fragment.lineStart, fragment.lineEnd]),
    [
      ["block-summary", 0, 1, 3],
      ["block-work", 0, 1, 4]
    ]
  );
  assert.equal(result.overflow.length, 0);
});

test("pagination pushes keepTogether blocks to the next page without mutating content", () => {
  const lockedContent = {
    lineCount: 4,
    marker: "keep-lock"
  };
  const intro = createLineBlock("block-intro", 4);
  const locked = documentIrModule.createBlock({
    id: "block-locked",
    type: documentIrModule.BLOCK_TYPES.PARAGRAPH,
    content: lockedContent,
    constraints: {
      keepTogether: true
    }
  });

  const result = paginationModule.paginateDocument({
    document: buildDocument([createSection("section-summary", "summary", 1, [intro, locked])]),
    templateSpec: templateSpecModule.resolveTemplateSpec("elegant"),
    pageBox: {
      linesPerPage: 6
    }
  });

  assert.equal(result.status, "multipage");
  assert.deepEqual(
    flattenRegionFragments(result, "main").map((fragment) => [fragment.blockId, fragment.pageIndex, fragment.lineStart, fragment.lineEnd]),
    [
      ["block-intro", 0, 1, 4],
      ["block-locked", 1, 1, 4]
    ]
  );
  assert.equal(result.decisions.some((decision) => decision.blockId === "block-locked" && decision.action === "push"), true);
  assert.deepEqual(locked.content, lockedContent);
});

test("pagination uses allowSplit, min line guards and splitPriority to choose split versus push", () => {
  const result = paginationModule.paginateDocument({
    document: buildDocument([
      createSection("section-summary", "summary", 1, [
        createLineBlock("block-intro", 3),
        createLineBlock("block-split-high", 5, {
          allowSplit: true,
          minLinesAtBottom: 2,
          minLinesAtTop: 2,
          splitPriority: 10
        }),
        createLineBlock("block-split-low", 5, {
          allowSplit: true,
          minLinesAtBottom: 2,
          minLinesAtTop: 2,
          splitPriority: 0
        })
      ])
    ]),
    templateSpec: templateSpecModule.resolveTemplateSpec("elegant"),
    pageBox: {
      linesPerPage: 6
    }
  });

  assert.equal(result.pageCount, 3);
  assert.deepEqual(
    flattenRegionFragments(result, "main").map((fragment) => [fragment.blockId, fragment.pageIndex, fragment.lineStart, fragment.lineEnd]),
    [
      ["block-intro", 0, 1, 3],
      ["block-split-high", 0, 1, 3],
      ["block-split-high", 1, 4, 5],
      ["block-split-low", 2, 1, 5]
    ]
  );
  assert.equal(result.decisions.some((decision) => decision.blockId === "block-split-high" && decision.action === "split"), true);
  assert.equal(result.decisions.some((decision) => decision.blockId === "block-split-low" && decision.action === "push"), true);
  assert.equal(result.overflow.length, 0);
});

test("pagination keeps unsplittable overflow explicit and never drops content", () => {
  const result = paginationModule.paginateDocument({
    document: buildDocument([
      createSection("section-summary", "summary", 1, [
        createLineBlock("block-overflow", 9, {
          keepTogether: true,
          allowSplit: false
        })
      ])
    ]),
    templateSpec: templateSpecModule.resolveTemplateSpec("elegant"),
    pageBox: {
      linesPerPage: 6
    }
  });

  assert.equal(result.status, "overflow");
  assert.equal(result.overflow.length, 1);
  assert.deepEqual(result.overflow[0], {
    blockId: "block-overflow",
    sectionId: "section-summary",
    region: "main",
    pageIndex: 0,
    requiredLines: 9,
    capacity: 6,
    reason: "block_exceeds_page_capacity"
  });
  assert.equal(totalFragmentLines(result), 9);
  assert.equal(flattenRegionFragments(result, "main")[0].overflow, true);
});

test("pagination paginates sidebar and main regions independently for two-column templates", () => {
  const result = paginationModule.paginateDocument({
    document: buildDocument([
      createSection("section-summary", "summary", 1, [createLineBlock("block-summary", 3)]),
      createSection("section-skills", "skills", 2, [
        createLineBlock("block-skills", 7, {
          allowSplit: true,
          minLinesAtBottom: 2,
          minLinesAtTop: 2,
          splitPriority: 10
        })
      ])
    ]),
    templateSpec: templateSpecModule.resolveTemplateSpec("sidebar"),
    pageBox: {
      linesPerPage: 6,
      regions: {
        sidebar: {
          linesPerPage: 4
        }
      }
    }
  });

  assert.equal(result.pageCount, 2);
  assert.deepEqual(
    flattenRegionFragments(result, "main").map((fragment) => [fragment.blockId, fragment.pageIndex, fragment.lineStart, fragment.lineEnd]),
    [["block-summary", 0, 1, 3]]
  );
  assert.deepEqual(
    flattenRegionFragments(result, "sidebar").map((fragment) => [fragment.blockId, fragment.pageIndex, fragment.lineStart, fragment.lineEnd]),
    [
      ["block-skills", 0, 1, 4],
      ["block-skills", 1, 5, 7]
    ]
  );
  assert.equal(result.pages[1].regions.main.length, 0);
  assert.equal(result.overflow.length, 0);
});

test("pagination consumes real document ir from resume model instead of synthetic-only fixtures", () => {
  const model = customTemplateModule.createTemplatePreviewSample();
  model.experience = Array.from({ length: 6 }, (_, idx) => ({
    company: { value: `公司${idx + 1}` },
    role: { value: `角色${idx + 1}` },
    start: { value: "2021-01" },
    end: { value: "2022-01" },
    bullets: Array.from(
      { length: 5 },
      (_item, bulletIndex) => `负责一个非常长的项目描述 ${idx + 1}-${bulletIndex + 1}，涵盖设计系统、中后台、跨团队协作、指标提升和落地复盘。`
    )
  }));

  const result = paginationModule.paginateDocument({
    document: adapterModule.modelToDocumentIR(model, "elegant"),
    templateSpec: templateSpecModule.resolveTemplateSpec("elegant"),
    pageBox: {
      linesPerPage: 40
    },
    charsPerLine: 30
  });

  assert.equal(result.status, "overflow");
  assert.equal(result.pageCount >= 2, true);
  assert.equal(result.overflow.length > 0, true);
  assert.equal(result.decisions.some((decision) => decision.action === "overflow"), true);
});

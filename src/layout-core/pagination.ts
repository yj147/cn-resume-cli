import { createBlockConstraints } from "./document-ir.js";

const REGION_NAMES = {
  MAIN: "main",
  SIDEBAR: "sidebar"
} as const;

function toPositiveNumber(value, fallback = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}

function resolvePageCapacity(pageBox: Record<string, any> = {}, region: string) {
  const defaultCapacity =
    toPositiveNumber(pageBox.linesPerPage) ||
    toPositiveNumber(pageBox.height) ||
    toPositiveNumber(pageBox.pageHeight) ||
    40;
  const regionBox = pageBox?.regions?.[region] || pageBox?.[region] || {};
  return (
    toPositiveNumber(regionBox.linesPerPage) ||
    toPositiveNumber(regionBox.height) ||
    defaultCapacity
  );
}

function estimateTextLines(text: string, charsPerLine: number) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return 0;
  }
  return Math.max(1, Math.ceil(normalized.length / charsPerLine));
}

function estimateContentLines(content: any, charsPerLine: number): number {
  if (!content) {
    return 0;
  }
  if (typeof content === "string") {
    return estimateTextLines(content, charsPerLine);
  }
  if (Array.isArray(content)) {
    return content.reduce((total, item) => total + estimateContentLines(item, charsPerLine), 0);
  }
  if (typeof content !== "object") {
    return 1;
  }
  if (toPositiveNumber(content.lineCount)) {
    return toPositiveNumber(content.lineCount);
  }
  return Object.entries(content).reduce((total, [key, value]) => {
    if (key === "lineCount") {
      return total;
    }
    return total + estimateContentLines(value, charsPerLine);
  }, 0);
}

export function estimateBlockLines(block: Record<string, any> = {}, input: Record<string, any> = {}) {
  if (typeof input.lineEstimator === "function") {
    const estimated = Number(input.lineEstimator(block));
    if (Number.isFinite(estimated) && estimated > 0) {
      return estimated;
    }
  }

  const charsPerLine = toPositiveNumber(input.charsPerLine, 32) || 32;
  const childBlocks = Array.isArray(block.children) ? block.children : [];
  const childLines = childBlocks.reduce((total, child) => total + estimateBlockLines(child, input), 0);
  const contentLines = estimateContentLines(block.content, charsPerLine);
  if (childLines > 0) {
    return childLines + Math.min(contentLines, 1);
  }
  return Math.max(contentLines, 1);
}

function resolveRegion(section: Record<string, any> = {}, sidebarTypes: Set<string>) {
  const sectionType = String(section?.content?.sectionType || "");
  return sidebarTypes.has(sectionType) ? REGION_NAMES.SIDEBAR : REGION_NAMES.MAIN;
}

function collectRegionBlocks(input: Record<string, any> = {}) {
  const document = input.document && typeof input.document === "object" ? input.document : { sections: [] };
  const templateSpec = input.templateSpec && typeof input.templateSpec === "object" ? input.templateSpec : {};
  const sidebarTypes: Set<string> = new Set(
    (Array.isArray(templateSpec?.sectionRecipes?.sidebar) ? templateSpec.sectionRecipes.sidebar : []).map((item) =>
      String(item || "")
    )
  );
  const regions = {
    [REGION_NAMES.MAIN]: [],
    [REGION_NAMES.SIDEBAR]: []
  };

  for (const section of Array.isArray(document.sections) ? document.sections : []) {
    if (section?.content?.visible === false) {
      continue;
    }
    const region = resolveRegion(section, sidebarTypes);
    for (const block of Array.isArray(section?.children) ? section.children : []) {
      regions[region].push({
        block,
        blockId: String(block?.id || ""),
        sectionId: String(section?.id || ""),
        sectionType: String(section?.content?.sectionType || ""),
        region,
        totalLines: estimateBlockLines(block, input),
        constraints: createBlockConstraints(block?.constraints)
      });
    }
  }

  return regions;
}

function createRegionPage(index: number) {
  return {
    index,
    usedLines: 0,
    blocks: []
  };
}

function ensureRegionPage(pages, index: number) {
  while (pages.length <= index) {
    pages.push(createRegionPage(pages.length));
  }
  return pages[index];
}

function createFragment(entry, pageIndex: number, lineStart: number, lineEnd: number, overflow = false) {
  return {
    blockId: entry.blockId,
    sectionId: entry.sectionId,
    sectionType: entry.sectionType,
    region: entry.region,
    pageIndex,
    lineStart,
    lineEnd,
    totalLines: entry.totalLines,
    continued: lineStart > 1 || lineEnd < entry.totalLines,
    overflow
  };
}

function createDecision(entry, pageIndex: number, action: string, reason: string, extra: Record<string, any> = {}) {
  return {
    blockId: entry.blockId,
    sectionId: entry.sectionId,
    region: entry.region,
    pageIndex,
    action,
    reason,
    splitPriority: Number(entry?.constraints?.splitPriority || 0),
    ...extra
  };
}

function resolveSplitLines(remainingLines: number, availableLines: number, constraints: Record<string, any>) {
  const minLinesAtBottom = Math.max(1, Number(constraints.minLinesAtBottom || 0) || 1);
  const minLinesAtTop = Math.max(1, Number(constraints.minLinesAtTop || 0) || 1);
  const upperBound = Math.min(availableLines, remainingLines - minLinesAtTop);
  if (upperBound < minLinesAtBottom) {
    return 0;
  }
  return upperBound;
}

function paginateRegion(entries, capacity: number) {
  const pages = [];
  const decisions = [];
  const overflow = [];
  let currentPageIndex = 0;

  for (const entry of entries) {
    let lineStart = 1;
    let remainingLines = Number(entry.totalLines || 0);
    let movedToNextPage = false;

    while (remainingLines > 0) {
      const page = ensureRegionPage(pages, currentPageIndex);
      const availableLines = Math.max(capacity - page.usedLines, 0);
      const keepTogether = entry.constraints.keepTogether === true;
      const allowSplit = keepTogether ? false : entry.constraints.allowSplit === true;
      const splitPriority = Number(entry.constraints.splitPriority || 0);

      if (remainingLines <= availableLines) {
        const fragment = createFragment(entry, currentPageIndex, lineStart, lineStart + remainingLines - 1);
        page.blocks.push(fragment);
        page.usedLines += remainingLines;
        decisions.push(
          createDecision(entry, currentPageIndex, movedToNextPage ? "push" : "keep", "placed_without_split", {
            lineStart: fragment.lineStart,
            lineEnd: fragment.lineEnd
          })
        );
        break;
      }

      if (page.usedLines > 0 && (keepTogether || !allowSplit || (splitPriority <= 0 && remainingLines <= capacity))) {
        decisions.push(createDecision(entry, currentPageIndex, "push", "move_to_next_page"));
        currentPageIndex += 1;
        movedToNextPage = true;
        continue;
      }

      if (!allowSplit) {
        const fragment = createFragment(entry, currentPageIndex, lineStart, lineStart + remainingLines - 1, true);
        page.blocks.push(fragment);
        page.usedLines += remainingLines;
        overflow.push({
          blockId: entry.blockId,
          sectionId: entry.sectionId,
          region: entry.region,
          pageIndex: currentPageIndex,
          requiredLines: remainingLines,
          capacity,
          reason: "block_exceeds_page_capacity"
        });
        decisions.push(createDecision(entry, currentPageIndex, "overflow", "block_exceeds_page_capacity"));
        break;
      }

      const splitLines = resolveSplitLines(remainingLines, availableLines || capacity, entry.constraints);
      if (splitLines <= 0) {
        if (page.usedLines > 0) {
          decisions.push(createDecision(entry, currentPageIndex, "push", "split_constraints_require_new_page"));
          currentPageIndex += 1;
          movedToNextPage = true;
          continue;
        }
        const fragment = createFragment(entry, currentPageIndex, lineStart, lineStart + remainingLines - 1, true);
        page.blocks.push(fragment);
        page.usedLines += remainingLines;
        overflow.push({
          blockId: entry.blockId,
          sectionId: entry.sectionId,
          region: entry.region,
          pageIndex: currentPageIndex,
          requiredLines: remainingLines,
          capacity,
          reason: "split_constraints_unsatisfied"
        });
        decisions.push(createDecision(entry, currentPageIndex, "overflow", "split_constraints_unsatisfied"));
        break;
      }

      const fragment = createFragment(entry, currentPageIndex, lineStart, lineStart + splitLines - 1);
      page.blocks.push(fragment);
      page.usedLines += splitLines;
      decisions.push(
        createDecision(entry, currentPageIndex, "split", "split_block_across_pages", {
          lineStart: fragment.lineStart,
          lineEnd: fragment.lineEnd
        })
      );
      lineStart += splitLines;
      remainingLines -= splitLines;
      currentPageIndex += 1;
      movedToNextPage = true;
    }
  }

  return {
    pages,
    decisions,
    overflow
  };
}

export function paginateDocument(input: Record<string, any> = {}) {
  const pageBox = input.pageBox && typeof input.pageBox === "object" ? input.pageBox : input.pageSize || {};
  const regionBlocks = collectRegionBlocks(input);
  const mainResult = paginateRegion(regionBlocks[REGION_NAMES.MAIN], resolvePageCapacity(pageBox, REGION_NAMES.MAIN));
  const sidebarResult = paginateRegion(regionBlocks[REGION_NAMES.SIDEBAR], resolvePageCapacity(pageBox, REGION_NAMES.SIDEBAR));
  const pageCount = Math.max(mainResult.pages.length, sidebarResult.pages.length, 1);
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    index,
    regions: {
      [REGION_NAMES.MAIN]: mainResult.pages[index]?.blocks || [],
      [REGION_NAMES.SIDEBAR]: sidebarResult.pages[index]?.blocks || []
    }
  }));
  const overflow = [...mainResult.overflow, ...sidebarResult.overflow];

  return {
    status: overflow.length > 0 ? "overflow" : pageCount > 1 ? "multipage" : "single-page",
    pageCount,
    pages,
    decisions: [...mainResult.decisions, ...sidebarResult.decisions],
    overflow
  };
}

export const BLOCK_TYPES = {
  SECTION: "section",
  GROUP: "group",
  PARAGRAPH: "paragraph",
  LIST: "list",
  LIST_ITEM: "list_item"
} as const;

export function createBlockConstraints(input: Record<string, any> = {}) {
  return {
    keepTogether: Boolean(input.keepTogether),
    allowSplit: Boolean(input.allowSplit),
    minLinesAtBottom: Number(input.minLinesAtBottom || 0),
    minLinesAtTop: Number(input.minLinesAtTop || 0),
    splitPriority: Number(input.splitPriority || 0)
  };
}

export function createTextRun(text, emphasis: Record<string, any> = {}) {
  return {
    text: String(text || ""),
    emphasis: {
      bold: Boolean(emphasis.bold),
      italic: Boolean(emphasis.italic),
      underline: Boolean(emphasis.underline)
    }
  };
}

export function createBlock(input: Record<string, any>) {
  return {
    id: String(input.id || ""),
    type: String(input.type || ""),
    content: input.content && typeof input.content === "object" ? input.content : {},
    children: Array.isArray(input.children) ? input.children : [],
    constraints: createBlockConstraints(input.constraints)
  };
}

export function createSectionBlock(input: Record<string, any>) {
  return createBlock({
    id: input.id,
    type: BLOCK_TYPES.SECTION,
    content: {
      sectionType: String(input.sectionType || ""),
      title: String(input.title || ""),
      sortOrder: Number(input.sortOrder || 0),
      visible: input.visible !== false,
      payload: input.payload && typeof input.payload === "object" ? input.payload : undefined
    },
    children: Array.isArray(input.blocks) ? input.blocks : [],
    constraints: input.constraints
  });
}

export function createDocumentIR(input: Record<string, any> = {}) {
  const sections = (Array.isArray(input.sections) ? input.sections : []).slice().sort((left, right) => {
    return Number(left?.content?.sortOrder || 0) - Number(right?.content?.sortOrder || 0);
  });
  return {
    id: String(input.id || "resume-document"),
    sections
  };
}

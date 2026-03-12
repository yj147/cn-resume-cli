import { BLOCK_TYPES } from "./document-ir.js";

export const RENDER_NODE_TYPES = {
  GROUP: "group",
  TEXT: "text",
  DECORATION: "decoration",
  PAGINATION_ANCHOR: "pagination_anchor"
} as const;

function renderRuns(content: Record<string, any> = {}) {
  const runs = Array.isArray(content.runs) ? content.runs : [];
  return runs.map((run) => ({
    text: String(run?.text || ""),
    emphasis: {
      bold: Boolean(run?.emphasis?.bold),
      italic: Boolean(run?.emphasis?.italic),
      underline: Boolean(run?.emphasis?.underline)
    }
  }));
}

function blockToRenderNode(block) {
  const children = Array.isArray(block?.children) ? block.children.map((child) => blockToRenderNode(child)) : [];
  if (block?.type === BLOCK_TYPES.PARAGRAPH) {
    return {
      id: String(block?.id || ""),
      type: RENDER_NODE_TYPES.TEXT,
      role: BLOCK_TYPES.PARAGRAPH,
      runs: renderRuns(block?.content)
    };
  }

  return {
    id: String(block?.id || ""),
    type: RENDER_NODE_TYPES.GROUP,
    role: String(block?.type || BLOCK_TYPES.GROUP),
    content: block?.content && typeof block.content === "object" ? block.content : {},
    children
  };
}

function sectionToRenderSection(section, sidebarTypes: Set<string>) {
  const bodyChildren = Array.isArray(section?.children) ? section.children.map((child) => blockToRenderNode(child)) : [];
  return {
    id: String(section?.id || ""),
    sectionType: String(section?.content?.sectionType || ""),
    sortOrder: Number(section?.content?.sortOrder || 0),
    title: {
      type: RENDER_NODE_TYPES.TEXT,
      text: String(section?.content?.title || "")
    },
    body: {
      type: RENDER_NODE_TYPES.GROUP,
      role: "section_body",
      children: bodyChildren
    },
    paginationAnchors: [
      {
        id: `anchor-${String(section?.id || "")}`,
        type: RENDER_NODE_TYPES.PAGINATION_ANCHOR,
        sectionId: String(section?.id || "")
      }
    ],
    region: sidebarTypes.has(String(section?.content?.sectionType || "")) ? "sidebar" : "main"
  };
}

export function buildRenderTree(input: Record<string, any> = {}) {
  const document = input.document && typeof input.document === "object" ? input.document : { sections: [] };
  const templateSpec = input.templateSpec && typeof input.templateSpec === "object" ? input.templateSpec : {};
  const sidebarTypes: Set<string> = new Set(
    (Array.isArray(templateSpec?.sectionRecipes?.sidebar) ? templateSpec.sectionRecipes.sidebar : []).map((item) => String(item || ""))
  );
  const sections = (Array.isArray(document.sections) ? document.sections : []).map((section) => sectionToRenderSection(section, sidebarTypes));

  return {
    id: String(document?.id || "render-tree"),
    title: String(input.title || ""),
    template: String(templateSpec?.name || ""),
    layoutFamily: String(templateSpec?.layoutFamily || "single-column"),
    regions: {
      sidebar: {
        sections: sections.filter((section) => section.region === "sidebar")
      },
      main: {
        sections: sections.filter((section) => section.region === "main")
      }
    },
    decorations: [
      {
        id: `decoration-${String(templateSpec?.name || "default")}`,
        type: RENDER_NODE_TYPES.DECORATION,
        token: {
          name: "accent",
          value: String(templateSpec?.visualTokens?.accent || "")
        }
      }
    ]
  };
}

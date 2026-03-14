import { BUILTIN_TEMPLATE_NAMES, BUILTIN_TEMPLATE_STYLES } from "./template/spec.js";

export const TEMPLATE_LIST = [...BUILTIN_TEMPLATE_NAMES];

export const TEMPLATE_ALIASES = {};

export const TEMPLATE_STYLES = { ...BUILTIN_TEMPLATE_STYLES };

export const TEMPLATE_GROUPS = {
  single: TEMPLATE_LIST.filter((name) => name.startsWith("single-")),
  split: TEMPLATE_LIST.filter((name) => name.startsWith("split-")),
  sidebar: TEMPLATE_LIST.filter((name) => name.startsWith("sidebar-")),
  compact: TEMPLATE_LIST.filter((name) => name.startsWith("compact-")),
  timeline: TEMPLATE_LIST.filter((name) => name.startsWith("timeline-")),
  editorial: TEMPLATE_LIST.filter((name) => name.startsWith("editorial-"))
};

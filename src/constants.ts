import { BUILTIN_TEMPLATE_NAMES, BUILTIN_TEMPLATE_STYLES } from "./template/spec.js";

export const TEMPLATE_LIST = [...BUILTIN_TEMPLATE_NAMES];

export const TEMPLATE_ALIASES = {
  magic: "modern",
  premium: "classic",
  "left-right": "two-column",
  compact: "compact",
  ats: "ats"
};

export const TEMPLATE_STYLES = { ...BUILTIN_TEMPLATE_STYLES };

export const TEMPLATE_GROUPS = {
  "base-20": TEMPLATE_LIST.slice(0, 20),
  "batch-1-industry": TEMPLATE_LIST.slice(20, 25),
  "batch-2-modern-tech": TEMPLATE_LIST.slice(25, 30),
  "batch-3-creative": TEMPLATE_LIST.slice(30, 35),
  "batch-4-culture": TEMPLATE_LIST.slice(35, 40),
  "batch-5-specialized": TEMPLATE_LIST.slice(40, 45),
  "batch-6-layout": TEMPLATE_LIST.slice(45)
};

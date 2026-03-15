export const TUI_THEME = {
  frame: {
    background: "#0d1117",
    surface: "#161b22",
    border: "#30363d",
    muted: "#8b949e"
  },
  chrome: {
    brand: "cn-resume",
    badge: "#21262d",
    accent: "#79c0ff",
    success: "#7ee787",
    warning: "#ffa657"
  },
  assistant: {
    accent: "#d2a8ff",
    header: "● cn-resume"
  },
  user: {
    accent: "#79c0ff",
    prompt: "❯"
  },
  tool: {
    cardBackground: "#161b22",
    diff: {
      add: "#7ee787",
      remove: "#ff7b72",
      meta: "#8b949e"
    }
  },
  preview: {
    accent: "#ffa657",
    label: "#8b949e"
  },
  input: {
    text: "#79c0ff",
    cursor: "#79c0ff",
    hint: "#8b949e"
  }
} as const;

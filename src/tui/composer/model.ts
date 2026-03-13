export const COMPOSER_HINTS = [
  "Enter send",
  "Ctrl+J newline",
  "Tab complete",
  "Esc close overlay"
];

export function buildComposerModel({
  draftText = "",
  focused = true,
  cursorVisible = true,
  chips = []
} = {}) {
  const normalizedText = String(draftText || "");
  return {
    lines: normalizedText.split("\n"),
    showCursor: Boolean(focused && cursorVisible),
    chips: Array.isArray(chips) ? chips : [],
    hints: COMPOSER_HINTS
  };
}

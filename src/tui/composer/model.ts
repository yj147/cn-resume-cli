export const COMPOSER_HINTS = [
  "TAB Auto-complete",
  "ESC Cancel",
  "ENTER Run"
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

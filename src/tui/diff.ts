export const DIFF_PREVIEW_COLLAPSE_THRESHOLD = 12;

export function summarizeDiffPreview(diffPreview = [], threshold = DIFF_PREVIEW_COLLAPSE_THRESHOLD) {
  if (!Array.isArray(diffPreview)) {
    return {
      condensed: false,
      hiddenCount: 0,
      lines: []
    };
  }

  if (diffPreview.length <= threshold) {
    return {
      condensed: false,
      hiddenCount: 0,
      lines: [...diffPreview]
    };
  }

  const hiddenCount = diffPreview.length - 6;
  return {
    condensed: true,
    hiddenCount,
    lines: [
      ...diffPreview.slice(0, 4),
      { kind: "meta", text: `… ${hiddenCount} lines hidden` },
      ...diffPreview.slice(-2)
    ]
  };
}

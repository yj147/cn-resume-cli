import { Text } from "ink";
import { TUI_THEME } from "../theme.js";

interface Segment {
  text: string;
  color?: string;
}

// Priority: backtick code > **bold** > "quoted" > 'quoted'
const INLINE_RE = /`([^`]+)`|\*\*([^*]+)\*\*|"([^"]+)"|'([^']+)'/g;

const COLOR_MAP = [
  TUI_THEME.chrome.accent,   // `code`   → cyan
  TUI_THEME.chrome.warning,  // **bold** → orange
  TUI_THEME.tool.diff.add,   // "quoted" → green
  TUI_THEME.tool.diff.add    // 'quoted' → green
] as const;

export function tokenize(raw: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  for (const match of raw.matchAll(INLINE_RE)) {
    const start = match.index!;
    if (start > cursor) {
      segments.push({ text: raw.slice(cursor, start) });
    }
    // match[1..4] correspond to the 4 capture groups
    for (let g = 0; g < COLOR_MAP.length; g++) {
      if (match[g + 1] != null) {
        segments.push({ text: match[g + 1], color: COLOR_MAP[g] });
        break;
      }
    }
    cursor = start + match[0].length;
  }

  if (cursor < raw.length) {
    segments.push({ text: raw.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text: raw }];
}

export function RichLine({ text }: { text: string }) {
  const segments = tokenize(text);
  return (
    <Text>
      {segments.map((seg, i) => (
        <Text key={`seg-${i}`} color={seg.color}>
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

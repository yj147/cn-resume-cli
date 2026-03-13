import { Box, Text } from "ink";
import { TUI_THEME } from "../theme.js";

function colorForDiffLine(kind) {
  if (kind === "add") {
    return TUI_THEME.tool.diff.add;
  }
  if (kind === "remove") {
    return TUI_THEME.tool.diff.remove;
  }
  return TUI_THEME.tool.diff.meta;
}

function prefixForDiffLine(kind) {
  if (kind === "add") {
    return "+";
  }
  if (kind === "remove") {
    return "-";
  }
  return "·";
}

export function ToolCard({ item }) {
  const lines = Array.isArray(item?.diff?.lines)
    ? item.diff.lines.filter((line) => !/\[(WARN|INFO)\]/.test(String(line?.text || "")))
    : [];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={TUI_THEME.frame.muted}>{`tool · ${item.taskType || "task"} · ${item.summary || item.status || ""}`}</Text>
      <Box flexDirection="column">
        {lines.map((line, index) => (
          <Text key={`${item.taskType || "task"}-${index}`} color={colorForDiffLine(line.kind)}>
            {`${prefixForDiffLine(line.kind)} ${line.text}`}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

import { Box, Text } from "ink";
import { TUI_THEME } from "../theme.js";

function colorForKind(kind) {
  if (kind === "error") {
    return TUI_THEME.tool.diff.remove;
  }
  if (kind === "result") {
    return TUI_THEME.tool.diff.add;
  }
  if (kind === "approval") {
    return TUI_THEME.assistant.accent;
  }
  return TUI_THEME.frame.muted;
}

export function StatusCard({ item }) {
  return (
    <Box marginBottom={1}>
      <Text color={colorForKind(item.kind)}>{item.content}</Text>
    </Box>
  );
}

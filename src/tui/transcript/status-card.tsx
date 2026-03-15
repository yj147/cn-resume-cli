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

function prefixForLevel(level) {
  if (level === "warn") {
    return "[WARN]";
  }
  if (level === "info") {
    return "[INFO]";
  }
  return "";
}

export function StatusCard({ item }) {
  if (item.kind === "approval") {
    const detail = item.content && item.content !== item.title ? item.content : "";
    return (
      <Box
        flexDirection="column"
        backgroundColor={TUI_THEME.frame.surface}
        marginBottom={2}
        borderStyle="round"
        borderColor={TUI_THEME.assistant.accent}
        paddingX={1}
      >
        <Text color={TUI_THEME.assistant.accent}>{item.title || "待确认操作"}</Text>
        {detail ? <Text>{detail}</Text> : null}
        <Text color={TUI_THEME.frame.muted}>{`${item.confirmLabel || "Enter 确认"}   ${item.rejectLabel || "Esc 取消"}`}</Text>
      </Box>
    );
  }

  const levelPrefix = prefixForLevel(item.level);
  return (
    <Box marginBottom={1}>
      {levelPrefix ? <Text color={colorForKind(item.kind)}>{levelPrefix}</Text> : null}
      {levelPrefix ? <Text> </Text> : null}
      <Text color={levelPrefix ? TUI_THEME.frame.muted : colorForKind(item.kind)}>
        {item.content}
      </Text>
    </Box>
  );
}

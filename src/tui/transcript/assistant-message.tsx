import { Box, Text } from "ink";
import { TUI_THEME } from "../theme.js";
import { RichLine } from "./rich-text.js";

export function AssistantMessage({ item }) {
  const lines = String(item?.content || "").split("\n");
  return (
    <Box flexDirection="column" marginBottom={2}>
      <Box marginBottom={1} gap={1}>
        <Text color={TUI_THEME.assistant.accent} bold>{item.header || TUI_THEME.assistant.header}</Text>
        {item?.meta ? <Text color={TUI_THEME.frame.muted}>{item.meta}</Text> : null}
      </Box>
      <Box flexDirection="column">
        {lines.map((line, index) => (
          <RichLine key={`assistant-line-${index}`} text={line} />
        ))}
      </Box>
    </Box>
  );
}

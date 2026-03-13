import { Box, Text } from "ink";
import { TUI_THEME } from "../theme.js";

export function AssistantMessage({ item }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={TUI_THEME.assistant.accent}>{item.header || TUI_THEME.assistant.header}</Text>
      <Text>{item.content}</Text>
    </Box>
  );
}

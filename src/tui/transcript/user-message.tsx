import { Box, Text } from "ink";
import { TUI_THEME } from "../theme.js";

export function UserMessage({ item }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={TUI_THEME.user.accent}>{`${TUI_THEME.user.prompt} User`}</Text>
      <Text color={TUI_THEME.frame.muted}>{item.content}</Text>
    </Box>
  );
}

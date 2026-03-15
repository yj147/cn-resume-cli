import { Box, Text } from "ink";
import { TUI_THEME } from "../theme.js";

export function UserMessage({ item }) {
  return (
    <Box flexDirection="column" marginBottom={2}>
      <Box marginBottom={1} gap={1}>
        <Text color={TUI_THEME.user.accent} bold>{`${TUI_THEME.user.prompt} User`}</Text>
      </Box>
      <Box>
        <Text color={TUI_THEME.frame.muted}>{item.content}</Text>
      </Box>
    </Box>
  );
}

import { Box, Text } from "ink";
import { TUI_THEME } from "../theme.js";

export function TemplateTab({ session }) {
  const previews = Array.isArray(session?.artifacts?.templateComparison?.previews)
    ? session.artifacts.templateComparison.previews
    : 0;
  const previewCount = Array.isArray(previews) ? previews.length : 0;
  const selectedTemplate = String(session?.currentTemplate?.templateId || session?.layoutResult?.selectedOption || "single-clean");

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="column" borderStyle="single" borderColor={TUI_THEME.frame.border} paddingX={2} paddingY={1}>
        <Text color={TUI_THEME.preview.accent} bold>TEMPLATE</Text>
        <Text>{selectedTemplate}</Text>
        <Text> </Text>
        <Text color={TUI_THEME.preview.accent} bold>PREVIEW CANDIDATES</Text>
        <Text>{String(previewCount)}</Text>
      </Box>
    </Box>
  );
}

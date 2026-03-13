import { Box, Text } from "ink";

export function TemplateTab({ session }) {
  const previews = Array.isArray(session?.artifacts?.templateComparison?.previews)
    ? session.artifacts.templateComparison.previews.length
    : 0;
  return (
    <Box flexDirection="column">
      <Text>{`Template previews: ${previews}`}</Text>
    </Box>
  );
}

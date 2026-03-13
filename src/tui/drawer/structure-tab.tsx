import { Box, Text } from "ink";

export function StructureTab({ session }) {
  const pendingPatchCount = Array.isArray(session?.pendingPatches) ? session.pendingPatches.length : 0;
  return (
    <Box flexDirection="column">
      <Text>{`Pending patches: ${pendingPatchCount}`}</Text>
      <Text>{`Workflow: ${String(session?.workflowState || "intake")}`}</Text>
    </Box>
  );
}

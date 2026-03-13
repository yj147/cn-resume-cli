import { Box, Text } from "ink";
import { createUiState } from "../ui-state.js";
import { StructureTab } from "./structure-tab.js";
import { TemplateTab } from "./template-tab.js";
import { TUI_THEME } from "../theme.js";

export function PreviewDrawer({ viewModel, session, uiState = createUiState() }) {
  const visible = Boolean(viewModel?.preview?.visible || uiState.manualPreviewPreference === "open");
  if (!visible) {
    return null;
  }

  const activeTab = uiState.activePreviewTab || "Structure";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={TUI_THEME.frame.border}>
      <Text color={TUI_THEME.frame.muted}>{`${viewModel.preview.statusLabel} · ${activeTab}`}</Text>
      {activeTab === "Template" ? <TemplateTab session={session} /> : <StructureTab session={session} />}
    </Box>
  );
}

import { Box, Text } from "ink";
import { createUiState } from "../ui-state.js";
import { StructureTab } from "./structure-tab.js";
import { TemplateTab } from "./template-tab.js";
import { TUI_THEME } from "../theme.js";

function truncateTitle(value, maxLength = 24) {
  const glyphs = Array.from(String(value || ""));
  if (glyphs.length <= maxLength) {
    return glyphs.join("");
  }
  return `${glyphs.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

export function PreviewDrawer({ viewModel, session, uiState = createUiState() }) {
  if (!viewModel?.preview?.visible) {
    return null;
  }

  const activeTab = uiState.activePreviewTab || "Structure";
  const previewTitle = truncateTitle(String(viewModel?.preview?.title || "session-preview").toUpperCase());

  return (
    <Box flexDirection="column" width="100%">
      <Box
        backgroundColor={TUI_THEME.frame.surface}
        borderBottom
        borderColor={TUI_THEME.frame.border}
        justifyContent="center"
        height={1}
      >
        <Text color={TUI_THEME.preview.label} bold>{`LIVE PREVIEW: ${previewTitle}`}</Text>
      </Box>
      <Box flexDirection="column" paddingX={2} paddingY={2}>
        <Box marginBottom={1}>
          <Text color={TUI_THEME.frame.muted}>{`${viewModel.preview.statusLabel} · ${activeTab}`}</Text>
        </Box>
        <Box>
          {activeTab === "Template" ? <TemplateTab session={session} /> : <StructureTab session={session} />}
        </Box>
      </Box>
    </Box>
  );
}

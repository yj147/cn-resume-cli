import { Box, Text, render as renderInk } from "ink";
import { loadChatRuntime, submitChatInput } from "../commands/chat.js";
import { renderBrandSplash } from "./brand.js";
import { buildTuiViewModel } from "./view-model.js";
import { TranscriptLane } from "./transcript/lane.js";
import { PreviewDrawer } from "./drawer/preview-drawer.js";
import { Composer } from "./composer/composer.js";
import { createUiState } from "./ui-state.js";

function AppFrame({ session, composerDraft, uiState }) {
  const viewModel = buildTuiViewModel(session);
  return (
    <Box flexDirection="column">
      <Text>{`${viewModel.header.brand} · ${viewModel.header.workflowState}`}</Text>
      <TranscriptLane items={viewModel.transcript} />
      <PreviewDrawer viewModel={viewModel} session={session} uiState={uiState} />
      <Composer draftText={composerDraft} focused cursorVisible />
    </Box>
  );
}

function defaultWrite(text) {
  process.stdout.write(text);
}

export async function runChatTui(options: Record<string, any> = {}) {
  const write = options.write || defaultWrite;
  const brandText = typeof options.brandText === "string" ? options.brandText : renderBrandSplash();
  const loadRuntime = options.loadRuntime || loadChatRuntime;
  const submitInput = options.submitInput || submitChatInput;
  const renderApp = options.renderApp || ((tree) => renderInk(tree));
  const uiState = options.uiState || createUiState();
  let composerDraft = String(options.initialDraft || "");
  let runtime = loadRuntime(options.flags || {}, { homeDir: options.homeDir });

  write(`${brandText}\n`);

  const renderTree = () => (
    <AppFrame session={runtime.session} composerDraft={composerDraft} uiState={uiState} />
  );

  const app = renderApp(renderTree());

  const rerender = () => {
    app.rerender(renderTree());
  };

  const io = {
    emit: () => {
      rerender();
    },
    write: () => {}
  };

  rerender();

  return {
    app,
    getRuntime: () => runtime,
    async submit(input) {
      composerDraft = String(input || "");
      const result = await submitInput(runtime, input, io, options.handlers || {});
      runtime = result.runtime;
      composerDraft = "";
      rerender();
      return result;
    },
    dispose() {
      app.unmount();
    }
  };
}

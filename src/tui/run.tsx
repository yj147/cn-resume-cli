import { emitKeypressEvents } from "node:readline";
import { readFileSync } from "node:fs";
import { Box, Text, render as renderInk } from "ink";
import {
  loadChatRuntime,
  submitChatInput,
  approvePendingPlan,
  cancelPendingPlan
} from "../commands/chat.js";
import { renderBrandSplash } from "./brand.js";
import { buildTuiViewModel } from "./view-model.js";
import { TranscriptLane } from "./transcript/lane.js";
import { PreviewDrawer } from "./drawer/preview-drawer.js";
import { Composer } from "./composer/composer.js";
import { createUiState } from "./ui-state.js";
import { TUI_THEME } from "./theme.js";

const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);

function readCliVersion() {
  try {
    const payload = JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8"));
    const version = String(payload?.version || "").trim();
    return version ? `v${version}` : "dev";
  } catch {
    return "dev";
  }
}

function formatClock(now = new Date()) {
  return [
    now.getHours().toString().padStart(2, "0"),
    now.getMinutes().toString().padStart(2, "0")
  ].join(":");
}

const CACHED_CLI_VERSION = readCliVersion();

function truncateLabel(value, maxLength = 28) {
  const glyphs = Array.from(String(value || ""));
  if (glyphs.length <= maxLength) {
    return glyphs.join("");
  }
  return `${glyphs.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

function resolveContextSummary(session) {
  const contextRefs = Array.isArray(session?.contextRefs) ? session.contextRefs.length : 0;
  return `${contextRefs} refs`;
}

function AppFrame({ runtime, composerDraft, uiState, clockText, brandText }) {
  const viewModel = buildTuiViewModel(runtime.session);
  const modelLabel = truncateLabel(runtime?.config?.model || "not-configured");
  const contextSummary = resolveContextSummary(runtime?.session);
  const versionLabel = CACHED_CLI_VERSION;
  const previewVisible = viewModel.preview.visible;

  return (
    <Box flexDirection="column" width="100%" backgroundColor={TUI_THEME.frame.background}>
      <Box
        flexDirection="column"
        width="100%"
        borderStyle="round"
        borderColor={TUI_THEME.frame.border}
        backgroundColor={TUI_THEME.frame.background}
      >
        <Box
          backgroundColor={TUI_THEME.frame.surface}
          borderBottom
          borderColor={TUI_THEME.frame.border}
          justifyContent="space-between"
          paddingX={1}
          height={1}
        >
          <Box>
            <Text color="#ff5f56">●</Text>
            <Text color="#ffbd2e"> ●</Text>
            <Text color="#27c93f"> ●</Text>
            <Text color={TUI_THEME.frame.muted}>{`  ${TUI_THEME.chrome.brand}`}</Text>
            <Text backgroundColor={TUI_THEME.chrome.badge} color={TUI_THEME.frame.muted} bold>{`  ${versionLabel}  `}</Text>
          </Box>
          <Box>
            <Text color={TUI_THEME.frame.muted}>MODEL:</Text>
            <Text color={TUI_THEME.chrome.accent}>{` ${modelLabel}`}</Text>
            <Text color={TUI_THEME.frame.muted}>{`  CONTEXT:`}</Text>
            <Text color={TUI_THEME.chrome.success}>{` ${contextSummary}`}</Text>
            <Text color={TUI_THEME.frame.muted}>{`  TIME:`}</Text>
            <Text>{` ${clockText}`}</Text>
          </Box>
        </Box>
        <Box flexDirection="column" paddingX={1} paddingTop={1} paddingBottom={1}>
          {brandText.split("\n").map((line, index) => (
            <Text key={`${index}:${line}`} color={TUI_THEME.frame.muted}>
              {line}
            </Text>
          ))}
        </Box>
        <Box flexDirection="row" flexGrow={1} minHeight={18}>
          <Box
            flexGrow={1}
            flexBasis={0}
            flexDirection="column"
            paddingX={2}
            paddingY={1}
          >
            <TranscriptLane items={viewModel.transcript} />
          </Box>
          {previewVisible ? <Text color={TUI_THEME.frame.border}>│</Text> : null}
          {previewVisible ? (
            <Box flexGrow={1} flexBasis={0} flexDirection="column">
              <PreviewDrawer viewModel={viewModel} session={runtime.session} uiState={uiState} />
            </Box>
          ) : null}
        </Box>
        <Box
          backgroundColor={TUI_THEME.frame.surface}
          borderTop
          borderColor={TUI_THEME.frame.border}
          paddingX={2}
          paddingY={0}
        >
          <Composer draftText={composerDraft} focused cursorVisible />
        </Box>
      </Box>
    </Box>
  );
}

async function defaultStartInteractiveSession(tui, options: Record<string, any> = {}) {
  const stdin = options.stdin || process.stdin;
  if (!stdin || typeof stdin.on !== "function") {
    return tui;
  }

  emitKeypressEvents(stdin);

  const shouldManageRawMode = Boolean(stdin.isTTY && typeof stdin.setRawMode === "function");
  const previousRawMode = Boolean(stdin.isRaw);
  if (typeof stdin.resume === "function") {
    stdin.resume();
  }
  if (shouldManageRawMode) {
    stdin.setRawMode(true);
  }

  let settled = false;
  let submitting = false;

  return await new Promise((resolve, reject) => {
    const cleanup = () => {
      stdin.off("keypress", onKeypress);
      stdin.off("end", onEnd);
      if (shouldManageRawMode) {
        stdin.setRawMode(previousRawMode);
      }
      if (typeof stdin.pause === "function") {
        stdin.pause();
      }
      tui.dispose();
    };

    const finish = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve(tui);
    };

    const onEnd = () => finish();

    const onKeypress = async (
      input,
      key: { ctrl?: boolean; meta?: boolean; name?: string } = {}
    ) => {
      try {
        if (key.ctrl && (key.name === "c" || key.name === "d")) {
          finish();
          return;
        }
        if (submitting) {
          return;
        }
        if (key.ctrl && key.name === "j") {
          tui.setDraft(`${tui.getDraft()}\n`);
          return;
        }
        if (key.name === "backspace") {
          tui.setDraft(tui.getDraft().slice(0, -1));
          return;
        }
        if (key.name === "escape" || key.name === "tab") {
          if (key.name === "escape" && tui.hasPendingApproval()) {
            const result = tui.cancelPending();
            if (result?.exit) {
              finish();
            }
          }
          return;
        }
        if (key.name === "return" || key.name === "enter") {
          const draft = tui.getDraft();
          if (!draft.trim() && tui.hasPendingApproval()) {
            submitting = true;
            const result = await tui.approvePending();
            submitting = false;
            if (result?.exit) {
              finish();
            }
            return;
          }
          if (!draft.trim()) {
            return;
          }
          submitting = true;
          const result = await tui.submit(draft);
          submitting = false;
          if (result?.exit) {
            finish();
          }
          return;
        }
        if (typeof input === "string" && input && !key.ctrl && !key.meta) {
          tui.setDraft(`${tui.getDraft()}${input}`);
        }
      } catch (error) {
        submitting = false;
        finish(error);
      }
    };

    stdin.on("keypress", onKeypress);
    stdin.on("end", onEnd);
  });
}

export async function runChatTui(options: Record<string, any> = {}) {
  const brandText = typeof options.brandText === "string" ? options.brandText : renderBrandSplash();
  const loadRuntime = options.loadRuntime || loadChatRuntime;
  const submitInput = options.submitInput || submitChatInput;
  const renderApp = options.renderApp || ((tree) => renderInk(tree));
  const startInteractiveSession = options.startInteractiveSession || defaultStartInteractiveSession;
  const uiState = options.uiState || createUiState();
  let composerDraft = String(options.initialDraft || "");
  let runtime = loadRuntime(options.flags || {}, { homeDir: options.homeDir });

  const resolveClockText = () => {
    if (typeof options.clockText === "function") {
      return String(options.clockText());
    }
    if (typeof options.clockText === "string") {
      return options.clockText;
    }
    return formatClock();
  };
  const renderTree = () => (
    <AppFrame
      runtime={runtime}
      composerDraft={composerDraft}
      uiState={uiState}
      clockText={resolveClockText()}
      brandText={brandText}
    />
  );

  const app = renderApp(renderTree());
  let lastClockDisplay = resolveClockText();
  const clockTimer = typeof options.clockText === "undefined"
    ? setInterval(() => {
      const next = resolveClockText();
      if (next !== lastClockDisplay) {
        lastClockDisplay = next;
        app.rerender(renderTree());
      }
    }, 1000)
    : null;
  clockTimer?.unref?.();

  const rerender = () => {
    app.rerender(renderTree());
  };

  const io = {
    emit: () => {
      rerender();
    },
    write: () => { }
  };

  rerender();

  const tui = {
    app,
    getRuntime: () => runtime,
    getDraft: () => composerDraft,
    hasPendingApproval() {
      return Boolean(runtime?.session?.pendingApproval?.action);
    },
    setDraft(nextDraft) {
      composerDraft = String(nextDraft || "");
      rerender();
    },
    async approvePending() {
      const result = await approvePendingPlan(runtime, io, options.handlers || {});
      runtime = result.runtime;
      rerender();
      return result;
    },
    cancelPending() {
      const result = cancelPendingPlan(runtime, io);
      runtime = result.runtime;
      rerender();
      return result;
    },
    async submit(input) {
      composerDraft = String(input || "");
      const result = await submitInput(runtime, input, io, options.handlers || {});
      runtime = result.runtime;
      composerDraft = "";
      rerender();
      return result;
    },
    dispose() {
      if (clockTimer) {
        clearInterval(clockTimer);
      }
      app.unmount();
    }
  };

  if (options.interactive) {
    await startInteractiveSession(tui, options);
  }

  return tui;
}

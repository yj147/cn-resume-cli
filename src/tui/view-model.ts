import { summarizeDiffPreview } from "./diff.js";

const PREVIEW_TABS = {
  STRUCTURE: "Structure",
  TEMPLATE: "Template"
} as const;

const PREVIEW_STATUS = {
  LIVE_DRAFT: "LIVE DRAFT",
  COMMITTED: "COMMITTED",
  EXPORT_PREVIEW: "EXPORT PREVIEW"
} as const;

function transcriptRef(session) {
  if (Array.isArray(session?.transcript)) {
    return session.transcript;
  }
  if (Array.isArray(session?.messages)) {
    return session.messages;
  }
  return [];
}

function isEditLoopActive(session) {
  return Boolean(session?.resumeDraft)
    || (Array.isArray(session?.pendingPatches) && session.pendingPatches.length > 0)
    || session?.phaseB?.status === "awaiting_feedback";
}

function resolvePreviewStatus(session) {
  if (isEditLoopActive(session)) {
    return PREVIEW_STATUS.LIVE_DRAFT;
  }
  if (Array.isArray(session?.artifacts?.templateComparison?.previews) && session.artifacts.templateComparison.previews.length > 0) {
    return PREVIEW_STATUS.EXPORT_PREVIEW;
  }
  return PREVIEW_STATUS.COMMITTED;
}

function isTranscriptNoiseText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return true;
  }
  if (/^(assistant|tool)_(started|completed|finished)$/i.test(normalized)) {
    return true;
  }
  return /<minimax:tool_call>/i.test(normalized);
}

function projectTranscriptItem(item, index) {
  if (!item || typeof item !== "object") {
    return {
      id: `transcript-${index}`,
      kind: "status",
      content: String(item || "")
    };
  }

  if (item.type === "user_message" || item.role === "user") {
    return {
      id: `transcript-${index}`,
      kind: "user",
      content: String(item.content || "")
    };
  }

  if (item.type === "assistant_completed" || item.type === "assistant_delta" || item.role === "assistant") {
    const content = String(item.content || "");
    if (isTranscriptNoiseText(content)) {
      return null;
    }
    return {
      id: `transcript-${index}`,
      kind: "assistant",
      header: "● cn-resume",
      content
    };
  }

  if (item.type === "task_finished") {
    return {
      id: `transcript-${index}`,
      kind: "tool",
      taskType: String(item.taskType || ""),
      summary: String(item.summary || ""),
      status: String(item.status || ""),
      defaultExpanded: item.defaultExpanded !== false,
      hideDiagnostics: item.hideDiagnostics !== false,
      diff: summarizeDiffPreview(item.diffPreview || [])
    };
  }

  if (item.type === "plan_proposed" || item.type === "approval_requested") {
    return {
      id: `transcript-${index}`,
      kind: "approval",
      content: String(item.summary || item.content || "")
    };
  }

  if (
    item.type === "template_selected"
    || item.type === "template_comparison_ready"
    || item.type === "layout_decision_recorded"
  ) {
    return {
      id: `transcript-${index}`,
      kind: "result",
      content: String(item.content || item.templateId || "")
    };
  }

  if (item.type === "error" || item.role === "error") {
    return {
      id: `transcript-${index}`,
      kind: "error",
      content: String(item.message || item.content || "")
    };
  }

  if (isTranscriptNoiseText(item.content || item.summary || item.type || "")) {
    return null;
  }
  return {
    id: `transcript-${index}`,
    kind: "status",
    content: String(item.content || item.summary || item.type || "")
  };
}

export function buildTuiViewModel(session) {
  const previewStatus = resolvePreviewStatus(session);
  const previewVisible = isEditLoopActive(session) || previewStatus === PREVIEW_STATUS.EXPORT_PREVIEW;

  return {
    header: {
      brand: "cn-resume",
      workflowState: String(session?.workflowState || "intake")
    },
    transcript: transcriptRef(session).map(projectTranscriptItem).filter(Boolean),
    composer: {
      multiline: true,
      hints: ["Enter send", "Ctrl+J newline", "Tab complete", "Esc close overlay"]
    },
    preview: {
      visible: previewVisible,
      tab: PREVIEW_TABS.STRUCTURE,
      statusLabel: previewStatus,
      lockedByEditLoop: isEditLoopActive(session)
    }
  };
}

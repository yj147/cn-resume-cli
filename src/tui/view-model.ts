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

function sanitizeTranscriptText(text) {
  return String(text || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think\b[^>]*>/gi, "")
    .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, "")
    .replace(/^\s*(assistant|tool)_(started|completed|finished)\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isTranscriptNoiseText(text) {
  return !sanitizeTranscriptText(text);
}

function resolvePreviewTitle(session) {
  const source = String(
    session?.artifacts?.latestDraftSourcePath
    || session?.artifacts?.latestModelPath
    || session?.currentResume?.sourcePath
    || ""
  ).trim();
  if (!source) {
    return "session-preview";
  }
  const segments = source.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) || "session-preview";
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
    const content = sanitizeTranscriptText(item.content || item.chunk || "");
    if (isTranscriptNoiseText(content)) {
      return null;
    }
    return {
      id: `transcript-${index}`,
      kind: "assistant",
      header: "● cn-resume",
      meta: item.at ? "Just now" : index === 0 ? "Just now" : "",
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
      title: String(item.title || item.summary || ""),
      content: String(item.summary || item.content || ""),
      confirmLabel: String(item.confirmLabel || "Enter 确认"),
      rejectLabel: String(item.rejectLabel || "Esc 取消")
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

  if (item.type === "log" || item.level === "warn" || item.level === "info") {
    return null;
  }

  if (item.type === "error" || item.role === "error") {
    const content = sanitizeTranscriptText(item.message || item.content || "");
    if (!content) {
      return null;
    }
    return {
      id: `transcript-${index}`,
      kind: "error",
      content
    };
  }

  const content = sanitizeTranscriptText(item.content || item.summary || item.type || "");
  if (!content) {
    return null;
  }
  return {
    id: `transcript-${index}`,
    kind: "status",
    content
  };
}

export function buildTuiViewModel(session) {
  const previewStatus = resolvePreviewStatus(session);

  return {
    header: {
      brand: "cn-resume",
      workflowState: String(session?.workflowState || "intake")
    },
    transcript: transcriptRef(session).map(projectTranscriptItem).filter(Boolean),
    composer: {
      multiline: true,
      hints: ["TAB Auto-complete", "ESC Cancel", "ENTER Run"]
    },
    preview: {
      visible: isEditLoopActive(session),
      tab: PREVIEW_TABS.STRUCTURE,
      statusLabel: previewStatus,
      title: resolvePreviewTitle(session),
      lockedByEditLoop: isEditLoopActive(session)
    }
  };
}

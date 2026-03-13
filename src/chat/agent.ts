import { createChatEvent } from "./events.js";
import { CHAT_STATES, CONTROLLER_EVENTS, transitionWorkflowState } from "./controller.js";
import { recordCheckpoint, syncSessionState } from "./session.js";
import { invalidateLayoutResult, normalizeLayoutResult, recordLayoutDecision } from "../flows/render.js";

function cloneSession(session) {
  return structuredClone(session);
}

function touchSession(session) {
  const updatedAt = new Date().toISOString();
  session.updatedAt = updatedAt;
  if (session.meta && typeof session.meta === "object") {
    session.meta.updatedAt = updatedAt;
  }
  return syncSessionState(session);
}

function appendMessage(session, role, content) {
  session.messages.push({ role, content });
}

function transcriptRef(session) {
  if (!Array.isArray(session.transcript)) {
    session.transcript = [];
  }
  if (session.transcript === session.messages) {
    session.transcript = [...session.transcript];
  }
  return session.transcript;
}

function appendEvent(session, event) {
  transcriptRef(session).push(event);
}

function tasksRef(session) {
  if (!Array.isArray(session.tasks)) {
    session.tasks = [];
  }
  return session.tasks;
}

function createTaskId() {
  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createTask(session, plan) {
  const task = {
    id: createTaskId(),
    type: plan.action.type,
    label: plan.summary,
    status: "waiting_approval"
  };
  tasksRef(session).push(task);
  return task;
}

function updateTaskStatus(session, taskId, status) {
  const task = tasksRef(session).find((item) => item.id === taskId);
  if (task) {
    task.status = status;
    return;
  }
  tasksRef(session).push({
    id: taskId || createTaskId(),
    type: "unknown",
    label: "",
    status
  });
}

function mergeArtifactPatch(session, patch: Record<string, any> = {}) {
  if (!patch || typeof patch !== "object") {
    return;
  }
  session.artifacts = {
    ...(session.artifacts || {}),
    ...patch
  };
}

function mergeSessionPatch(session, patch: Record<string, any> = {}) {
  if (patch.currentResume) {
    session.currentResume = patch.currentResume;
  }
  if (patch.currentJd) {
    session.currentJd = patch.currentJd;
  }
  if (patch.currentTemplate) {
    session.currentTemplate = patch.currentTemplate;
  }
  if (patch.reviewResult) {
    session.reviewResult = patch.reviewResult;
  }
  if (patch.layoutResult) {
    session.layoutResult = normalizeLayoutResult(patch.layoutResult);
  }
  if (patch.artifacts) {
    session.artifacts = {
      ...(session.artifacts || {}),
      ...patch.artifacts
    };
  }
}

function pendingPatchesRef(session) {
  if (!Array.isArray(session.pendingPatches)) {
    session.pendingPatches = [];
  }
  return session.pendingPatches;
}

function patchDecisionsRef(session) {
  if (!Array.isArray(session.patchDecisions)) {
    session.patchDecisions = [];
  }
  return session.patchDecisions;
}

function createPatchId() {
  return `patch-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function appendResumeDraft(session, draft) {
  if (!draft || typeof draft !== "object") {
    return;
  }
  session.resumeDraft = draft;
  const patches = Array.isArray(draft.patches) ? draft.patches : [];
  pendingPatchesRef(session).push(
    ...patches.map((patch) => ({
      ...patch,
      patchId: patch.patchId || createPatchId(),
      status: "pending"
    }))
  );
}

function findPendingPatchIndex(session, options) {
  const pendingPatches = pendingPatchesRef(session);
  const patchId = String(options?.patchId || "").trim();
  if (patchId) {
    return pendingPatches.findIndex((patch) => patch.patchId === patchId);
  }
  const moduleName = String(options?.module || "").trim();
  if (moduleName) {
    return pendingPatches.findIndex((patch) => patch.module === moduleName);
  }
  return -1;
}

function recordPatchDecision(session, patch, decision, reason = "") {
  patchDecisionsRef(session).push({
    patchId: patch.patchId,
    module: patch.module,
    decision,
    reason,
    decidedAt: new Date().toISOString()
  });
}

function ensureCurrentResume(session) {
  if (session.currentResume?.model) {
    return session.currentResume;
  }
  session.currentResume = {
    sourcePath: String(session.artifacts?.latestDraftSourcePath || session.currentResume?.sourcePath || ""),
    model: {}
  };
  return session.currentResume;
}

function applyPatch(session, patch) {
  const currentResume = ensureCurrentResume(session);
  currentResume.model = {
    ...(currentResume.model || {}),
    [patch.module]: structuredClone(patch.nextValue)
  };
}

function updateWorkflowAfterPatchDecision(session, event, remainingPatchCount) {
  if (session?.workflowState !== CHAT_STATES.PENDING_CONFIRMATION) {
    return;
  }
  if (remainingPatchCount !== 0) {
    return;
  }
  session.workflowState = transitionWorkflowState(session.workflowState, event);
}

function appendLayoutDecisionPrompt(session) {
  const layoutResult = normalizeLayoutResult(session?.layoutResult);
  if (!layoutResult || layoutResult.status !== "overflow" || layoutResult.selectedOption) {
    return;
  }
  session.layoutResult = layoutResult;
  appendEvent(
    session,
    createChatEvent("layout_overflow", {
      layoutResult
    })
  );
  appendEvent(
    session,
    createChatEvent("layout_decision_requested", {
      pageCount: layoutResult.pageCount,
      options: layoutResult.options
    })
  );
  appendMessage(
    session,
    "assistant",
    "检测到超页风险。请选择 accept_multipage、switch_compact_template 或 generate_compaction_patch。"
  );
}

export function acceptPendingPatch(session, options: Record<string, any> = {}) {
  const next = cloneSession(session);
  const patchIndex = findPendingPatchIndex(next, options);
  if (patchIndex < 0) {
    throw new Error("BLOCKED: pending patch not found");
  }
  const [patch] = pendingPatchesRef(next).splice(patchIndex, 1);
  applyPatch(next, patch);
  recordPatchDecision(next, patch, "accepted");
  updateWorkflowAfterPatchDecision(next, CONTROLLER_EVENTS.PATCH_ACCEPTED, pendingPatchesRef(next).length);
  recordCheckpoint(next, "patch_accepted");
  return touchSession(next);
}

export function rejectPendingPatch(session, options: Record<string, any> = {}) {
  const next = cloneSession(session);
  const patchIndex = findPendingPatchIndex(next, options);
  if (patchIndex < 0) {
    throw new Error("BLOCKED: pending patch not found");
  }
  const [patch] = pendingPatchesRef(next).splice(patchIndex, 1);
  recordPatchDecision(next, patch, "rejected", String(options?.reason || ""));
  updateWorkflowAfterPatchDecision(next, CONTROLLER_EVENTS.PATCH_REJECTED, pendingPatchesRef(next).length);
  recordCheckpoint(next, "patch_rejected");
  return touchSession(next);
}

export function confirmLayoutDecision(session, selectedOption: string) {
  const next = cloneSession(session);
  next.layoutResult = recordLayoutDecision(next.layoutResult, selectedOption);
  appendEvent(
    next,
    createChatEvent("layout_decision_recorded", {
      selectedOption: next.layoutResult.selectedOption,
      confirmed: next.layoutResult.confirmed
    })
  );
  appendMessage(next, "assistant", `已记录排版决策：${next.layoutResult.selectedOption}`);
  recordCheckpoint(next, "layout_decision_recorded");
  return touchSession(next);
}

export function selectTemplateCandidate(session, templateId: string) {
  const next = cloneSession(session);
  const previousTemplateId = String(next?.currentTemplate?.templateId || "").trim();
  const selectedTemplateId = String(templateId || "").trim();
  const comparedTemplateIds = Array.isArray(next?.artifacts?.templateComparison?.comparedTemplateIds)
    ? next.artifacts.templateComparison.comparedTemplateIds
    : [];

  if (!selectedTemplateId || !comparedTemplateIds.includes(selectedTemplateId)) {
    throw new Error("BLOCKED: template candidate not found in current comparison");
  }

  next.artifacts = {
    ...(next.artifacts || {}),
    templateComparison: {
      ...(next.artifacts?.templateComparison || {}),
      selectedTemplateId
    }
  };
  next.currentTemplate = {
    templateId: selectedTemplateId,
    source: "ab_selected",
    confirmed: true,
    comparedTemplateIds: [...comparedTemplateIds],
    selectedAt: new Date().toISOString()
  };
  if (next.layoutResult && previousTemplateId !== selectedTemplateId) {
    next.layoutResult = invalidateLayoutResult(next.layoutResult, selectedTemplateId);
  }
  appendEvent(
    next,
    createChatEvent("template_selected", {
      templateId: selectedTemplateId
    })
  );
  appendMessage(next, "assistant", `已选择模板：${selectedTemplateId}`);
  recordCheckpoint(next, "template_selected");
  return touchSession(next);
}

export function planToolAction(session, plan) {
  const next = cloneSession(session);
  const task = createTask(next, plan);
  next.pendingPlan = {
    summary: plan.summary,
    action: plan.action,
    taskId: task.id
  };
  next.pendingApproval = {
    title: plan.summary,
    summary: plan.summary,
    action: plan.action,
    taskId: task.id
  };
  appendEvent(
    next,
    createChatEvent("plan_proposed", {
      summary: plan.summary,
      action: plan.action
    })
  );
  appendEvent(
    next,
    createChatEvent("approval_requested", {
      title: plan.summary,
      summary: "请输入 /go 确认，或 /cancel 取消。"
    })
  );
  appendMessage(next, "assistant", `计划：${plan.summary}`);
  return touchSession(next);
}

export async function confirmPendingPlan(session, handlers) {
  if (!session?.pendingPlan?.action) {
    throw new Error("BLOCKED: no pending plan");
  }

  const next = cloneSession(session);
  const pendingPlan = next.pendingPlan;
  updateTaskStatus(next, pendingPlan.taskId, "running");
  appendEvent(
    next,
    createChatEvent("task_started", {
      taskType: pendingPlan.action.type,
      summary: pendingPlan.summary
    })
  );

  try {
    const result = await handlers.runTool(pendingPlan.action, next);
    appendResumeDraft(next, result?.resumeDraft);
    mergeSessionPatch(next, result?.sessionPatch);
    mergeArtifactPatch(next, result?.artifactPatch);
    next.pendingPlan = undefined;
    next.pendingApproval = undefined;
    if (Array.isArray(result?.resumeDraft?.patches) && result.resumeDraft.patches.length > 0) {
      if (next.workflowState === CHAT_STATES.DRAFTING) {
        next.workflowState = transitionWorkflowState(next.workflowState, CONTROLLER_EVENTS.PATCH_GENERATED);
      }
      recordCheckpoint(next, "patch_generated");
      if (pendingPlan.action.type === "parse-resume") {
        recordCheckpoint(next, "parse_completed");
      }
      if (pendingPlan.action.type === "author-resume") {
        recordCheckpoint(next, "authoring_completed");
      }
    }
    if (result?.sessionPatch?.reviewResult) {
      recordCheckpoint(next, "review_completed");
      if (result.sessionPatch.reviewResult.summary?.blocked && next.workflowState === CHAT_STATES.CONFIRMED_CONTENT) {
        next.workflowState = transitionWorkflowState(next.workflowState, CONTROLLER_EVENTS.REVIEW_FAILED);
      }
    }
    updateTaskStatus(next, pendingPlan.taskId, result?.taskPatch?.status || "done");
    appendEvent(
      next,
      createChatEvent("task_finished", {
        taskType: pendingPlan.action.type,
        status: "done"
      })
    );

    if (result?.phaseB?.status === "awaiting_feedback") {
      next.phaseB = {
        ...result.phaseB,
        action: pendingPlan.action,
        taskId: pendingPlan.taskId
      };
      updateTaskStatus(next, pendingPlan.taskId, "waiting_phase_b_feedback");
      appendEvent(
        next,
        createChatEvent("assistant_completed", {
          content: result.phaseB.prompt
        })
      );
      appendMessage(next, "assistant", result.phaseB.prompt);
      return touchSession(next);
    }

    if (result?.phaseB) {
      next.phaseB = result.phaseB;
    }
    if (Array.isArray(result?.artifactPatch?.templateComparison?.comparedTemplateIds)) {
      appendEvent(
        next,
        createChatEvent("template_comparison_ready", {
          templateIds: result.artifactPatch.templateComparison.comparedTemplateIds
        })
      );
      appendMessage(
        next,
        "assistant",
        `已生成基于当前内容的模板对比：${result.artifactPatch.templateComparison.comparedTemplateIds.join(" vs ")}。请用 /choose-template <模板名> 明确选择。`
      );
    }
    appendLayoutDecisionPrompt(next);
    return touchSession(next);
  } catch (error) {
    const message = String(error?.message || error);
    next.workflowState = CHAT_STATES.ERROR;
    updateTaskStatus(next, pendingPlan.taskId, "error");
    appendEvent(
      next,
      createChatEvent("task_finished", {
        taskType: pendingPlan.action.type,
        status: "error"
      })
    );
    appendEvent(
      next,
      createChatEvent("error", {
        message
      })
    );
    appendMessage(next, "error", message);
    (error as any).session = touchSession(next);
    throw error;
  }
}

export async function confirmPhaseB(session, feedbackText, handlers) {
  if (session?.phaseB?.status !== "awaiting_feedback" || !session.phaseB.action) {
    throw new Error("BLOCKED: no pending phase b confirmation");
  }

  const next = cloneSession(session);
  const taskId = next.phaseB.taskId;
  updateTaskStatus(next, taskId, "running");

  const action = {
    ...next.phaseB.action,
    feedbackText,
    confirm: true
  };
  appendEvent(
    next,
    createChatEvent("task_started", {
      taskType: action.type,
      summary: "phase_b_confirm"
    })
  );

  try {
  const result = await handlers.runTool(action, next);
  appendResumeDraft(next, result?.resumeDraft);
  mergeSessionPatch(next, result?.sessionPatch);
  mergeArtifactPatch(next, result?.artifactPatch);
    next.phaseB = result?.phaseB || {
      ...next.phaseB,
      status: "confirmed"
    };
    if (next.phaseB.status === "confirmed") {
      recordCheckpoint(next, "phase_b_confirmed");
    }
    appendEvent(
      next,
      createChatEvent("task_finished", {
        taskType: action.type,
        status: "done"
      })
    );
    if (next.phaseB?.prompt) {
      appendEvent(
        next,
        createChatEvent("assistant_completed", {
          content: next.phaseB.prompt
        })
      );
    }
    updateTaskStatus(next, taskId, next.phaseB.status === "awaiting_feedback" ? "waiting_phase_b_feedback" : (result?.taskPatch?.status || "done"));
    return touchSession(next);
  } catch (error) {
    const message = String(error?.message || error);
    next.workflowState = CHAT_STATES.ERROR;
    updateTaskStatus(next, taskId, "error");
    appendEvent(
      next,
      createChatEvent("task_finished", {
        taskType: action.type,
        status: "error"
      })
    );
    appendEvent(
      next,
      createChatEvent("error", {
        message
      })
    );
    appendMessage(next, "error", message);
    (error as any).session = touchSession(next);
    throw error;
  }
}

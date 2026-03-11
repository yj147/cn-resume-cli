import { createChatEvent } from "./events.js";

function cloneSession(session) {
  return structuredClone(session);
}

function touchSession(session) {
  const updatedAt = new Date().toISOString();
  session.updatedAt = updatedAt;
  if (session.meta && typeof session.meta === "object") {
    session.meta.updatedAt = updatedAt;
  }
  return session;
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
  if (patch.artifacts) {
    session.artifacts = {
      ...(session.artifacts || {}),
      ...patch.artifacts
    };
  }
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
  next.state = { status: "waiting_confirm" };
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
  next.state = { status: "running" };
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
    mergeSessionPatch(next, result?.sessionPatch);
    mergeArtifactPatch(next, result?.artifactPatch);
    next.pendingPlan = undefined;
    next.pendingApproval = undefined;
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
      next.state = { status: "waiting_phase_b_feedback" };
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
    next.state = { status: "idle" };
    return touchSession(next);
  } catch (error) {
    const message = String(error?.message || error);
    next.state = { status: "error", message };
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
  next.state = { status: "running" };
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
    mergeSessionPatch(next, result?.sessionPatch);
    mergeArtifactPatch(next, result?.artifactPatch);
    next.phaseB = result?.phaseB || {
      ...next.phaseB,
      status: "confirmed"
    };
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
    next.state = next.phaseB.status === "awaiting_feedback" ? { status: "waiting_phase_b_feedback" } : { status: "idle" };
    updateTaskStatus(next, taskId, next.phaseB.status === "awaiting_feedback" ? "waiting_phase_b_feedback" : (result?.taskPatch?.status || "done"));
    return touchSession(next);
  } catch (error) {
    const message = String(error?.message || error);
    next.state = { status: "error", message };
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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CHAT_STATES } from "./controller.js";
import { readJson, writeJson } from "../core/io.js";
import { getCnResumeHome } from "../env.js";

const ID_SAFE_NAME = /^[A-Za-z0-9._-]+$/;

export function getChatStoragePaths(homeDir = os.homedir()) {
  const chatDir = path.join(getCnResumeHome(homeDir), "chat");
  return {
    chatDir,
    activeFile: path.join(chatDir, "active.json"),
    sessionsDir: path.join(chatDir, "sessions")
  };
}

function buildSessionId(now) {
  return `session-${now.replace(/[^\d]/g, "").slice(0, 14)}`;
}

function deriveWorkflowState(session, fallback = CHAT_STATES.INTAKE) {
  if (typeof session?.workflowState === "string" && session.workflowState) {
    return session.workflowState;
  }
  const legacyStatus = String(session?.state?.status || "").trim();
  if (legacyStatus === CHAT_STATES.BLOCKED || legacyStatus === CHAT_STATES.ERROR) {
    return CHAT_STATES.BLOCKED;
  }
  if (legacyStatus === CHAT_STATES.WAITING_CONFIRM || legacyStatus === CHAT_STATES.WAITING_PHASE_B_FEEDBACK) {
    return CHAT_STATES.DRAFTING;
  }
  if (legacyStatus === CHAT_STATES.IDLE || legacyStatus === CHAT_STATES.RUNNING) {
    return fallback;
  }
  return fallback;
}

function deriveSessionStatus(session) {
  const workflowState = deriveWorkflowState(session);
  if (workflowState === CHAT_STATES.BLOCKED || workflowState === CHAT_STATES.ERROR) {
    return workflowState;
  }
  if (session?.phaseB?.status === "awaiting_feedback") {
    return CHAT_STATES.WAITING_PHASE_B_FEEDBACK;
  }
  if (session?.pendingPlan?.action || session?.pendingApproval) {
    return CHAT_STATES.WAITING_CONFIRM;
  }
  return CHAT_STATES.IDLE;
}

export function syncSessionState(session) {
  const stableCheckpoint = [...(Array.isArray(session?.checkpoints) ? session.checkpoints : [])].reverse().find(
    (item) => item && typeof item === "object" && item.stable === true && typeof item.workflowState === "string" && item.workflowState
  );
  session.workflowState = deriveWorkflowState(session, stableCheckpoint?.workflowState || CHAT_STATES.INTAKE);
  session.state = { status: deriveSessionStatus(session) };
  return session;
}

export function recordCheckpoint(session, key, options: Record<string, any> = {}) {
  if (!Array.isArray(session.checkpoints)) {
    session.checkpoints = [];
  }
  const workflowState = String(options.workflowState || session.workflowState || CHAT_STATES.INTAKE);
  const checkpoint = {
    key: String(key || "").trim(),
    workflowState,
    stable: options.stable !== false,
    recordedAt: String(options.recordedAt || new Date().toISOString())
  };
  const last = session.checkpoints.at(-1);
  if (
    last?.key === checkpoint.key &&
    last?.workflowState === checkpoint.workflowState &&
    last?.stable === checkpoint.stable
  ) {
    return session;
  }
  session.checkpoints.push(checkpoint);
  return session;
}

function normalizeSession(session) {
  const now = new Date().toISOString();
  const sessionMeta = session?.meta && typeof session.meta === "object" ? session.meta : {};
  const id = String(session?.id || sessionMeta?.id || buildSessionId(now));
  const createdAt = String(session?.createdAt || sessionMeta?.createdAt || now);
  const updatedAt = String(session?.updatedAt || sessionMeta?.updatedAt || session?.createdAt || sessionMeta?.createdAt || now);
  const messages = Array.isArray(session?.messages)
    ? session.messages
    : Array.isArray(session?.transcript)
      ? session.transcript
      : [];
  const transcript = Array.isArray(session?.transcript)
    ? session.transcript
    : Array.isArray(session?.messages)
      ? session.messages
      : [];
  const selection = session?.selection && typeof session.selection === "object"
    ? {
        pane: String(session.selection.pane || "transcript"),
        entityId: String(session.selection.entityId || ""),
        detailsTab: String(session.selection.detailsTab || "plan")
      }
    : {
        pane: "transcript",
        entityId: "",
        detailsTab: "plan"
      };
  const checkpoints = Array.isArray(session?.checkpoints) ? session.checkpoints : [];

  return syncSessionState({
    ...session,
    meta: {
      ...sessionMeta,
      id,
      title: String(sessionMeta?.title || ""),
      createdAt,
      updatedAt,
      cwd: String(sessionMeta?.cwd || process.cwd())
    },
    id,
    createdAt,
    updatedAt,
    messages,
    transcript,
    artifacts: session?.artifacts && typeof session.artifacts === "object" ? session.artifacts : {},
    tasks: Array.isArray(session?.tasks) ? session.tasks : [],
    pendingPatches: Array.isArray(session?.pendingPatches) ? session.pendingPatches : [],
    patchDecisions: Array.isArray(session?.patchDecisions) ? session.patchDecisions : [],
    pendingApproval: session?.pendingApproval && typeof session.pendingApproval === "object" ? session.pendingApproval : undefined,
    reviewResult: session?.reviewResult && typeof session.reviewResult === "object" ? session.reviewResult : null,
    layoutResult: session?.layoutResult && typeof session.layoutResult === "object" ? session.layoutResult : null,
    currentTemplate: session?.currentTemplate && typeof session.currentTemplate === "object" ? session.currentTemplate : null,
    checkpoints,
    contextRefs: Array.isArray(session?.contextRefs) ? session.contextRefs : [],
    selection,
    composerDraft: String(session?.composerDraft || "")
  });
}

function resolveNamedSessionFile(name, homeDir = os.homedir()) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName || !ID_SAFE_NAME.test(normalizedName)) {
    throw new Error("session name must match [A-Za-z0-9._-]+");
  }
  return path.join(getChatStoragePaths(homeDir).sessionsDir, `${normalizedName}.json`);
}

export function createChatSession(now = new Date().toISOString()) {
  return normalizeSession({
    id: buildSessionId(now),
    createdAt: now,
    updatedAt: now,
    messages: [],
    artifacts: {},
    workflowState: CHAT_STATES.INTAKE,
    reviewResult: null,
    layoutResult: null,
    currentTemplate: null,
    checkpoints: []
  });
}

export function loadActiveSession(homeDir = os.homedir()) {
  const { activeFile } = getChatStoragePaths(homeDir);
  if (!fs.existsSync(activeFile)) {
    return createChatSession();
  }
  return normalizeSession(readJson(activeFile));
}

export function saveActiveSession(session, homeDir = os.homedir()) {
  const { activeFile } = getChatStoragePaths(homeDir);
  const normalized = normalizeSession({
    ...session,
    updatedAt: new Date().toISOString()
  });
  const { state: _state, ...persisted } = normalized;
  writeJson(activeFile, persisted);
  return normalized;
}

export function saveNamedSession(name, session, homeDir = os.homedir()) {
  const filePath = resolveNamedSessionFile(name, homeDir);
  const normalized = normalizeSession(session);
  const { state: _state, ...persisted } = normalized;
  writeJson(filePath, persisted);
  return normalized;
}

export function loadNamedSession(name, homeDir = os.homedir()) {
  return normalizeSession(readJson(resolveNamedSessionFile(name, homeDir)));
}

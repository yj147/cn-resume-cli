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
  const stableCheckpoint = [...checkpoints].reverse().find(
    (item) => item && typeof item === "object" && item.stable === true && typeof item.workflowState === "string" && item.workflowState
  );
  const workflowState = typeof session?.workflowState === "string" && session.workflowState
    ? session.workflowState
    : stableCheckpoint?.workflowState || CHAT_STATES.INTAKE;

  return {
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
    state: session?.state && typeof session.state === "object" ? session.state : { status: CHAT_STATES.IDLE },
    artifacts: session?.artifacts && typeof session.artifacts === "object" ? session.artifacts : {},
    tasks: Array.isArray(session?.tasks) ? session.tasks : [],
    pendingPatches: Array.isArray(session?.pendingPatches) ? session.pendingPatches : [],
    patchDecisions: Array.isArray(session?.patchDecisions) ? session.patchDecisions : [],
    pendingApproval: session?.pendingApproval && typeof session.pendingApproval === "object" ? session.pendingApproval : undefined,
    workflowState,
    reviewResult: session?.reviewResult && typeof session.reviewResult === "object" ? session.reviewResult : null,
    layoutResult: session?.layoutResult && typeof session.layoutResult === "object" ? session.layoutResult : null,
    currentTemplate: session?.currentTemplate && typeof session.currentTemplate === "object" ? session.currentTemplate : null,
    checkpoints,
    contextRefs: Array.isArray(session?.contextRefs) ? session.contextRefs : [],
    selection,
    composerDraft: String(session?.composerDraft || "")
  };
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
    state: { status: CHAT_STATES.IDLE },
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
  writeJson(activeFile, normalized);
  return normalized;
}

export function saveNamedSession(name, session, homeDir = os.homedir()) {
  const filePath = resolveNamedSessionFile(name, homeDir);
  const normalized = normalizeSession(session);
  writeJson(filePath, normalized);
  return normalized;
}

export function loadNamedSession(name, homeDir = os.homedir()) {
  return normalizeSession(readJson(resolveNamedSessionFile(name, homeDir)));
}

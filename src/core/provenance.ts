export const FIELD_SOURCES = {
  USER_EXPLICIT: "user_explicit",
  PARSED_EXACT: "parsed_exact",
  PARSED_INFERRED: "parsed_inferred",
  AI_DRAFTED: "ai_drafted",
  AI_REWRITTEN: "ai_rewritten",
  USER_CONFIRMED: "user_confirmed"
} as const;

export const FIELD_STATUSES = {
  EMPTY: "empty",
  SUGGESTED: "suggested",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  STALE: "stale"
} as const;

const FIELD_STATUS_PRIORITY = {
  [FIELD_STATUSES.EMPTY]: 0,
  [FIELD_STATUSES.SUGGESTED]: 1,
  [FIELD_STATUSES.STALE]: 2,
  [FIELD_STATUSES.REJECTED]: 3,
  [FIELD_STATUSES.CONFIRMED]: 4
} as const;

export function nowUpdatedAt(now = new Date()) {
  return now.toISOString();
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
}

export function resolveFieldStatus(value, status = "") {
  if (status && Object.values(FIELD_STATUSES).includes(status as (typeof FIELD_STATUSES)[keyof typeof FIELD_STATUSES])) {
    return status;
  }
  return String(value || "").trim() ? FIELD_STATUSES.SUGGESTED : FIELD_STATUSES.EMPTY;
}

export function upgradeFieldStatus(currentStatus, nextStatus) {
  const current = resolveFieldStatus("", currentStatus);
  const next = resolveFieldStatus("", nextStatus);
  return FIELD_STATUS_PRIORITY[next] > FIELD_STATUS_PRIORITY[current] ? next : current;
}

export function createFieldEnvelope({
  value = "",
  source = FIELD_SOURCES.USER_EXPLICIT,
  confidence = 0,
  status = "",
  updatedBy = source,
  updatedAt = nowUpdatedAt()
} = {}) {
  return {
    value,
    source,
    confidence: clampConfidence(confidence),
    status: resolveFieldStatus(value, status),
    updatedBy,
    updatedAt
  };
}

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

function hasFieldValue(value) {
  return String(value || "").trim().length > 0;
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
}

function defaultStatusForSource(source: string, value) {
  if (!hasFieldValue(value)) {
    return FIELD_STATUSES.EMPTY;
  }
  if (source === FIELD_SOURCES.USER_EXPLICIT || source === FIELD_SOURCES.USER_CONFIRMED) {
    return FIELD_STATUSES.CONFIRMED;
  }
  return FIELD_STATUSES.SUGGESTED;
}

export function resolveFieldStatus(value, status = "", source: string = FIELD_SOURCES.USER_EXPLICIT) {
  if (status && Object.values(FIELD_STATUSES).includes(status as (typeof FIELD_STATUSES)[keyof typeof FIELD_STATUSES])) {
    return status;
  }
  return defaultStatusForSource(source, value);
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
}: {
  value?: string;
  source?: string;
  confidence?: number;
  status?: string;
  updatedBy?: string;
  updatedAt?: string;
} = {}) {
  return {
    value,
    source,
    confidence: hasFieldValue(value) ? clampConfidence(confidence) : 0,
    status: resolveFieldStatus(value, status, source),
    updatedBy,
    updatedAt
  };
}

export function normalizeFieldEnvelope(rawField, options: { source?: string; confidence?: number } = {}) {
  const source = options.source || FIELD_SOURCES.USER_EXPLICIT;
  const confidence = options.confidence ?? 1;
  if (rawField && typeof rawField === "object" && !Array.isArray(rawField) && "value" in rawField) {
    return createFieldEnvelope({
      value: rawField.value,
      source: rawField.source || source,
      confidence: rawField.confidence ?? confidence,
      status: rawField.status || "",
      updatedBy: rawField.updatedBy || rawField.source || source,
      updatedAt: rawField.updatedAt || nowUpdatedAt()
    });
  }
  return createFieldEnvelope({
    value: rawField,
    source,
    confidence
  });
}

export function getFieldValue(field) {
  if (field == null) {
    return "";
  }
  if (typeof field !== "object" || Array.isArray(field)) {
    throw new Error("invalid field envelope");
  }
  return String(field.value || "");
}

import { assertPhaseBConfirmedOrThrow } from "./flows/parse-optimize.js";
import { assertLayoutExportReady, normalizeLayoutResult } from "./flows/render.js";

function hasPendingPatches(session) {
  return Array.isArray(session?.pendingPatches) && session.pendingPatches.length > 0;
}

function hasPendingApproval(session) {
  return Boolean(session?.pendingApproval);
}

function assertReviewReady(reviewResult, commandName) {
  if (reviewResult?.summary?.blocked) {
    throw new Error(`BLOCKED: review_blockers_present. Resolve review blockers before ${commandName}.`);
  }
  return reviewResult || null;
}

function assertTemplateSelected(templateId, commandName) {
  const resolved = String(templateId || "").trim();
  if (!resolved) {
    throw new Error(`BLOCKED: template_selection_required. Choose a template before ${commandName}.`);
  }
  return resolved;
}

function assertLayoutReady(layoutResult, commandName) {
  const normalized = normalizeLayoutResult(layoutResult);
  if (!normalized) {
    throw new Error(`BLOCKED: layout_result_required. Solve layout before ${commandName}.`);
  }
  assertLayoutExportReady(normalized, commandName);
  return normalized;
}

export function assertSessionExportReady(session, commandName = "export") {
  if (hasPendingPatches(session)) {
    throw new Error(`BLOCKED: patch_confirmation_required. Confirm pending patches before ${commandName}.`);
  }
  if (hasPendingApproval(session)) {
    throw new Error(`BLOCKED: plan_confirmation_required. Confirm pending plan before ${commandName}.`);
  }

  return {
    reviewResult: assertReviewReady(session?.reviewResult, commandName),
    templateId: assertTemplateSelected(session?.currentTemplate?.templateId, commandName),
    layoutResult: assertLayoutReady(session?.layoutResult, commandName)
  };
}

export function assertModelExportReady(model, input: Record<string, any> = {}) {
  const commandName = String(input.commandName || "export");
  assertPhaseBConfirmedOrThrow(model, commandName);

  return {
    reviewResult: assertReviewReady(model?.meta?.reviewResult || model?.meta?.review_result, commandName),
    templateId: assertTemplateSelected(
      input.templateId || model?.render_config?.template || model?.meta?.template,
      commandName
    ),
    layoutResult: assertLayoutReady(
      model?.meta?.layoutResult || model?.meta?.layout_result || model?.render_config?.layoutResult,
      commandName
    )
  };
}

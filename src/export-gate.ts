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

function resolveTemplateConfirmed(options: Record<string, any> = {}) {
  if (options.explicitInput === true) {
    return true;
  }
  const flags = [
    options.metaTemplateConfirmed,
    options.metaTemplateConfirmedLegacy,
    options.renderTemplateConfirmed
  ].filter((value) => typeof value === "boolean");
  if (flags.includes(false)) {
    return false;
  }
  return flags.includes(true);
}

function assertTemplateSelected(templateId, commandName, options: Record<string, any> = {}) {
  const resolved = String(templateId || "").trim();
  if (!resolved) {
    throw new Error(`BLOCKED: template_selection_required. Choose a template before ${commandName}.`);
  }
  if (resolveTemplateConfirmed(options) !== true) {
    throw new Error(`BLOCKED: template_confirmation_required. Explicitly confirm template '${resolved}' before ${commandName}.`);
  }
  return resolved;
}

function assertLayoutReady(layoutResult, commandName, templateId = "") {
  const normalized = normalizeLayoutResult(layoutResult);
  if (!normalized) {
    throw new Error(`BLOCKED: layout_result_required. Solve layout before ${commandName}.`);
  }
  assertLayoutExportReady(normalized, commandName);
  if (templateId && normalized.templateId !== templateId) {
    throw new Error(`BLOCKED: layout_stability_required. Re-run layout for template '${templateId}' before ${commandName}.`);
  }
  if (normalized.stable !== true) {
    throw new Error(`BLOCKED: layout_stability_required. Re-run layout before ${commandName}.`);
  }
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
    templateId: assertTemplateSelected(session?.currentTemplate?.templateId, commandName, {
      metaTemplateConfirmed: session?.currentTemplate?.confirmed
    }),
    layoutResult: assertLayoutReady(session?.layoutResult, commandName, session?.currentTemplate?.templateId)
  };
}

export function assertModelExportReady(model, input: Record<string, any> = {}) {
  const commandName = String(input.commandName || "export");
  assertPhaseBConfirmedOrThrow(model, commandName);

  return {
    reviewResult: assertReviewReady(model?.meta?.reviewResult || model?.meta?.review_result, commandName),
    templateId: assertTemplateSelected(
      input.templateId || model?.render_config?.template || model?.meta?.template,
      commandName,
      {
        explicitInput: input.explicitTemplateSelection === true,
        metaTemplateConfirmed: model?.meta?.templateConfirmed,
        metaTemplateConfirmedLegacy: model?.meta?.template_confirmed,
        renderTemplateConfirmed: model?.render_config?.templateConfirmed
      }
    ),
    layoutResult: assertLayoutReady(
      model?.meta?.layoutResult || model?.meta?.layout_result || model?.render_config?.layoutResult,
      commandName,
      input.templateId || model?.render_config?.template || model?.meta?.template
    )
  };
}

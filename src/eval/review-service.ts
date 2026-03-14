import {
  analyzeByRule,
  analyzeJdByAI,
  grammarByRule,
  grammarCheckByAI,
  resolveEvalOptions,
  validateByAI,
  validateByRule
} from "./evaluation.js";

export const REVIEW_TASKS = {
  VALIDATE: "validate",
  ANALYZE_JD: "analyze-jd",
  GRAMMAR_CHECK: "grammar-check"
} as const;

export const REVIEW_CATEGORIES = {
  FACT_CONSISTENCY: "fact_consistency",
  CONTENT_QUALITY: "content_quality",
  JD_MATCH: "jd_match",
  LAYOUT_QUALITY: "layout_quality"
} as const;

export const REVIEW_SEVERITIES = {
  BLOCKER: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion"
} as const;

function createFinding(source, category, severity, message, details: Record<string, unknown> = {}) {
  return {
    source,
    category,
    severity,
    message,
    details
  };
}

async function runValidateReview(model, jdText, template, options) {
  if (options.engine === "rule") {
    return validateByRule(model, jdText, template, options);
  }
  return validateByAI(model, jdText, template, options);
}

async function runAnalyzeReview(model, jdText, options) {
  if (options.engine === "rule") {
    return analyzeByRule(model, jdText, options);
  }
  return analyzeJdByAI(model, jdText, options);
}

async function runGrammarReview(model, options) {
  if (options.engine === "rule") {
    return grammarByRule(model, options);
  }
  return grammarCheckByAI(model, options);
}

function collectValidateFindings(report) {
  const findings = [];
  if (!report.quality_gates?.passed || report.verdict !== "PASS") {
    findings.push(
      createFinding(
        REVIEW_TASKS.VALIDATE,
        REVIEW_CATEGORIES.FACT_CONSISTENCY,
        REVIEW_SEVERITIES.BLOCKER,
        "简历内容尚未通过基础审核门槛。",
        {
          verdict: report.verdict,
          average: report.average,
          quality_gates: report.quality_gates
        }
      )
    );
  }
  for (const warning of report.warnings || []) {
    const category = /一页|视觉|版面/.test(warning)
      ? REVIEW_CATEGORIES.LAYOUT_QUALITY
      : REVIEW_CATEGORIES.FACT_CONSISTENCY;
    findings.push(
      createFinding(
        REVIEW_TASKS.VALIDATE,
        category,
        REVIEW_SEVERITIES.WARNING,
        warning,
        {
          template: report.template
        }
      )
    );
  }
  if (Number(report.scores?.["版面适配度"] || 0) < 7 && !findings.some((item) => item.category === REVIEW_CATEGORIES.LAYOUT_QUALITY)) {
    findings.push(
      createFinding(
        REVIEW_TASKS.VALIDATE,
        REVIEW_CATEGORIES.LAYOUT_QUALITY,
        REVIEW_SEVERITIES.WARNING,
        "当前内容密度较高，排版存在超页风险。",
        {
          score: report.scores?.["版面适配度"] || 0
        }
      )
    );
  }
  if (!findings.some((item) => item.category === REVIEW_CATEGORIES.LAYOUT_QUALITY)) {
    findings.push(
      createFinding(
        REVIEW_TASKS.VALIDATE,
        REVIEW_CATEGORIES.LAYOUT_QUALITY,
        REVIEW_SEVERITIES.SUGGESTION,
        "当前模板版面通过了基础检查，可继续结合预览微调。",
        {
          score: report.scores?.["版面适配度"] || 0,
          template: report.template
        }
      )
    );
  }
  return findings;
}

function collectAnalyzeFindings(report) {
  const findings = [];
  if (report.summary) {
    findings.push(
      createFinding(
        REVIEW_TASKS.ANALYZE_JD,
        REVIEW_CATEGORIES.JD_MATCH,
        report.overallScore < 60 ? REVIEW_SEVERITIES.BLOCKER : REVIEW_SEVERITIES.WARNING,
        report.summary,
        {
          overallScore: report.overallScore,
          atsScore: report.atsScore
        }
      )
    );
  }
  for (const keyword of (report.missingKeywords || []).slice(0, 5)) {
    findings.push(
      createFinding(
        REVIEW_TASKS.ANALYZE_JD,
        REVIEW_CATEGORIES.JD_MATCH,
        REVIEW_SEVERITIES.WARNING,
        `缺少 JD 关键词：${keyword}`,
        {
          keyword
        }
      )
    );
  }
  for (const suggestion of (report.suggestions || []).slice(0, 5)) {
    findings.push(
      createFinding(
        REVIEW_TASKS.ANALYZE_JD,
        REVIEW_CATEGORIES.JD_MATCH,
        REVIEW_SEVERITIES.SUGGESTION,
        `${suggestion.section}: ${suggestion.suggested}`,
        suggestion
      )
    );
  }
  return findings;
}

function collectGrammarFindings(report) {
  return (report.issues || []).map((issue) => createFinding(
    REVIEW_TASKS.GRAMMAR_CHECK,
    REVIEW_CATEGORIES.CONTENT_QUALITY,
    issue.severity === "high"
      ? REVIEW_SEVERITIES.BLOCKER
      : issue.severity === "medium"
        ? REVIEW_SEVERITIES.WARNING
        : REVIEW_SEVERITIES.SUGGESTION,
    `${issue.sectionTitle}: ${issue.original}`,
    issue
  ));
}

function defaultChecks(jdText) {
  return jdText
    ? [REVIEW_TASKS.VALIDATE, REVIEW_TASKS.ANALYZE_JD, REVIEW_TASKS.GRAMMAR_CHECK]
    : [REVIEW_TASKS.VALIDATE, REVIEW_TASKS.GRAMMAR_CHECK];
}

export async function runReviewService(input: Record<string, any> = {}) {
  const options = input.options || resolveEvalOptions({});
  const jdText = String(input.jdText || "");
  const template = String(input.template || "single-clean");
  const checks = Array.isArray(input.checks) && input.checks.length ? input.checks : defaultChecks(jdText);
  const reports: Record<string, unknown> = {};
  const findings = [];

  for (const check of checks) {
    if (check === REVIEW_TASKS.VALIDATE) {
      const report = await runValidateReview(input.model, jdText, template, options);
      reports[REVIEW_TASKS.VALIDATE] = report;
      findings.push(...collectValidateFindings(report));
      continue;
    }
    if (check === REVIEW_TASKS.ANALYZE_JD) {
      const report = await runAnalyzeReview(input.model, jdText, options);
      reports[REVIEW_TASKS.ANALYZE_JD] = report;
      findings.push(...collectAnalyzeFindings(report));
      continue;
    }
    if (check === REVIEW_TASKS.GRAMMAR_CHECK) {
      const report = await runGrammarReview(input.model, options);
      reports[REVIEW_TASKS.GRAMMAR_CHECK] = report;
      findings.push(...collectGrammarFindings(report));
      continue;
    }
    throw new Error(`unsupported review task '${String(check)}'`);
  }

  const blockers = findings.filter((item) => item.severity === REVIEW_SEVERITIES.BLOCKER);
  const warnings = findings.filter((item) => item.severity === REVIEW_SEVERITIES.WARNING);
  const suggestions = findings.filter((item) => item.severity === REVIEW_SEVERITIES.SUGGESTION);

  return {
    blockers,
    warnings,
    suggestions,
    findings,
    reports,
    summary: {
      blocked: blockers.length > 0,
      counts: {
        blocker: blockers.length,
        warning: warnings.length,
        suggestion: suggestions.length
      },
      checks
    }
  };
}

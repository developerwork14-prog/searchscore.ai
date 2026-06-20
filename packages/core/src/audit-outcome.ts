import type { TechnicalCategoryStatus } from "./types.js";

export interface ParameterOutcome {
  passed: boolean;
  skipped?: boolean;
  warning?: boolean;
}

export function scoreParameterOutcomes(
  checks: readonly ParameterOutcome[],
  emptyScore = 100
) {
  const applicable = checks.filter((check) => !check.skipped);
  if (!applicable.length) return emptyScore;
  const passed = applicable.filter((check) => check.passed && !check.warning).length;
  return Math.round((passed / applicable.length) * 100);
}

export function statusForParameterOutcomes(
  checks: readonly ParameterOutcome[]
): TechnicalCategoryStatus {
  const applicable = checks.filter((check) => !check.skipped);
  if (!applicable.length) return "Skipped";
  if (applicable.some((check) => !check.passed && !check.warning)) {
    return "Needs Attention";
  }
  if (applicable.some((check) => check.warning)) return "Minor Attention";
  return "Passed";
}

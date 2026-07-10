import { getRule } from "../rules/definitions.js";

export function explainRule(ruleId: string): string {
  const rule = getRule(ruleId.toUpperCase());
  return [
    rule.id,
    "",
    `Severity: ${rule.severity}`,
    `Title: ${rule.title}`,
    "",
    "What it detects:",
    rule.what_it_detects,
    "",
    "Why it matters:",
    rule.why_it_matters,
    "",
    "False positive notes:",
    rule.false_positive_notes,
    "",
    "Recommended action:",
    rule.recommended_action,
    ""
  ].join("\n");
}

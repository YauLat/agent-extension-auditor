import type { RuleDefinition, Severity } from "../types.js";

export const severityRank: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1
};

export const severityLabels: Record<Severity, string> = {
  critical: "CRIT",
  high: "HIGH",
  medium: "MED",
  low: "LOW",
  info: "INFO"
};

export const rules: RuleDefinition[] = [
  {
    id: "MCP_STDIO_COMMAND",
    severity: "high",
    title: "MCP server starts a local command",
    what_it_detects: "An MCP server definition with a command field, usually stdio-based.",
    why_it_matters: "Starting local commands gives the extension executable behavior on the user's machine.",
    false_positive_notes: "Many legitimate MCP servers use stdio. The finding means review is needed, not that the server is malicious.",
    recommended_action: "Review the command source, package name, arguments, and maintainer before enabling it."
  },
  {
    id: "MCP_ENV_REFERENCE",
    severity: "medium",
    title: "MCP server references environment variables",
    what_it_detects: "MCP env blocks or secret-like environment references.",
    why_it_matters: "Environment variables often contain API keys or tokens that tools can read at runtime.",
    false_positive_notes: "Some env vars are harmless configuration. Secret values are not printed by this tool.",
    recommended_action: "Confirm the server only receives variables it truly needs."
  },
  {
    id: "MCP_NETWORK_SERVER",
    severity: "medium",
    title: "MCP server uses a network endpoint",
    what_it_detects: "MCP definitions with URL-like server fields or network transport markers.",
    why_it_matters: "Network-connected servers can send prompts, tool inputs, or metadata outside the machine.",
    false_positive_notes: "Remote MCP servers can be legitimate when the provider and scopes are understood.",
    recommended_action: "Review the endpoint owner, auth model, and data handling policy."
  },
  {
    id: "PLUGIN_POSTINSTALL",
    severity: "high",
    title: "Plugin package has install lifecycle scripts",
    what_it_detects: "package.json scripts such as preinstall, install, postinstall, or prepare.",
    why_it_matters: "Install lifecycle scripts can execute code during package installation.",
    false_positive_notes: "Build tooling sometimes uses lifecycle scripts legitimately.",
    recommended_action: "Read the script and package source before installing globally or enabling the plugin."
  },
  {
    id: "PLUGIN_BIN_EXECUTABLE",
    severity: "low",
    title: "Plugin package exposes executables",
    what_it_detects: "package.json bin entries.",
    why_it_matters: "Executables may be invoked by agents, shell commands, or users.",
    false_positive_notes: "Most CLI packages expose bin entries by design.",
    recommended_action: "Confirm the executable name and package source match what you intended to install."
  },
  {
    id: "HOOK_SHELL_COMMAND",
    severity: "high",
    title: "Hook contains shell command behavior",
    what_it_detects: "Hook-like configuration containing command strings or common shell executables.",
    why_it_matters: "Hooks can run automatically at sensitive moments in an agent workflow.",
    false_positive_notes: "Some agent hooks are expected, but they deserve explicit review.",
    recommended_action: "Review trigger timing, command source, and side effects."
  },
  {
    id: "REMOTE_SCRIPT_EXECUTION",
    severity: "critical",
    title: "Remote script execution pattern",
    what_it_detects: "Patterns such as curl or wget piped into a shell.",
    why_it_matters: "Remote scripts can change behavior without local review and may execute arbitrary code.",
    false_positive_notes: "Install docs sometimes show these commands, but they should not be blindly trusted.",
    recommended_action: "Download and inspect the script, pin the source, or avoid the pattern."
  },
  {
    id: "SECRET_PATTERN_REFERENCE",
    severity: "medium",
    title: "Secret-like reference detected",
    what_it_detects: "Secret-looking environment variable names or credential markers.",
    why_it_matters: "Extensions that receive credentials can access private APIs or accounts.",
    false_positive_notes: "The scanner reports references only and does not print secret values.",
    recommended_action: "Confirm the extension really needs the credential and receives the narrowest possible scope."
  },
  {
    id: "WORKSPACE_OUTSIDE_READ",
    severity: "medium",
    title: "Potential read outside workspace",
    what_it_detects: "References to broad home-directory or parent-directory reads.",
    why_it_matters: "Broad local reads may expose unrelated private files to an extension.",
    false_positive_notes: "Documentation can mention paths without granting access.",
    recommended_action: "Review whether the extension needs access outside the active workspace."
  },
  {
    id: "WRITE_OR_DELETE_CAPABILITY",
    severity: "high",
    title: "Write or delete capability marker",
    what_it_detects: "Commands or code markers associated with file writes, deletes, or destructive changes.",
    why_it_matters: "Write and delete operations can mutate local state and are harder to reverse.",
    false_positive_notes: "Some tools need write access to function. The risk depends on scope and trigger.",
    recommended_action: "Review the exact scope and make sure destructive operations are human-gated."
  },
  {
    id: "AUTO_UPDATE_BEHAVIOR",
    severity: "medium",
    title: "Auto-update behavior marker",
    what_it_detects: "Configuration or scripts suggesting automatic update behavior.",
    why_it_matters: "Auto-update can change trusted code after the initial review.",
    false_positive_notes: "Some update checks are passive and do not install anything.",
    recommended_action: "Prefer pinned versions or explicit update approval."
  },
  {
    id: "UNKNOWN_SOURCE",
    severity: "low",
    title: "Extension source could not be determined",
    what_it_detects: "Skills or plugins without obvious source, repository, origin, or package metadata.",
    why_it_matters: "Unknown provenance makes review, updates, and incident response harder.",
    false_positive_notes: "Local private skills often do not include source metadata.",
    recommended_action: "Add source metadata or document why the extension is trusted."
  },
  {
    id: "DUPLICATE_SKILL_NAME",
    severity: "medium",
    title: "Duplicate skill name",
    what_it_detects: "Multiple SKILL.md files declaring the same skill name.",
    why_it_matters: "Duplicate names can confuse discovery, activation, and maintenance.",
    false_positive_notes: "Different agents can intentionally keep copies of the same skill.",
    recommended_action: "Confirm which copy is canonical and remove or rename stale duplicates."
  },
  {
    id: "OVERSIZED_SKILL_CONTEXT",
    severity: "low",
    title: "Oversized skill context",
    what_it_detects: "Very large SKILL.md files that may consume excessive context.",
    why_it_matters: "Oversized skills can slow agents and bury important instructions.",
    false_positive_notes: "Some reference-heavy skills are intentionally large.",
    recommended_action: "Split large references into separate files and keep SKILL.md focused."
  }
];

export const ruleById = new Map(rules.map((rule) => [rule.id, rule]));

export function getRule(ruleId: string): RuleDefinition {
  const rule = ruleById.get(ruleId);
  if (!rule) {
    throw new Error(`Unknown rule: ${ruleId}`);
  }
  return rule;
}

export function sortFindings<T extends { severity: Severity; ruleId: string }>(findings: T[]): T[] {
  return [...findings].sort((a, b) => {
    const severityDelta = severityRank[b.severity] - severityRank[a.severity];
    return severityDelta || a.ruleId.localeCompare(b.ruleId);
  });
}

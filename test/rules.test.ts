import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rules } from "../src/rules/definitions.js";

describe("rule documentation", () => {
  it("has a Markdown document for every rule definition", () => {
    for (const rule of rules) {
      const docPath = path.resolve("rules", `${rule.id}.md`);
      expect(fs.existsSync(docPath), `${rule.id} should have a rule document`).toBe(true);
      const content = fs.readFileSync(docPath, "utf8");
      expect(content).toContain(`# ${rule.id}`);
      expect(content).toContain(`Severity: ${rule.severity}`);
    }
  });

  it("does not have orphan rule documents", () => {
    const knownRuleIds = new Set(rules.map((rule) => rule.id));
    const docs = fs
      .readdirSync(path.resolve("rules"))
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) => fileName.replace(/\.md$/, ""));

    for (const doc of docs) {
      expect(knownRuleIds.has(doc), `${doc} should exist in rule definitions`).toBe(true);
    }
  });
});

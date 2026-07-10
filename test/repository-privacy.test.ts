import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootFiles = [
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "PRIVACY.md",
  "README.md",
  "SECURITY.md",
  "package-lock.json",
  "package.json"
];
const sourceRoots = [".github", "apps/macos", "docs", "examples", "rules", "src", "test"];
const textExtensions = new Set([".html", ".json", ".md", ".plist", ".sh", ".swift", ".ts", ".yaml", ".yml"]);

describe("public repository privacy", () => {
  const files = [
    ...rootFiles,
    ...sourceRoots.flatMap((root) => collectTextFiles(path.resolve(root)))
  ].filter((file) => !file.endsWith("repository-privacy.test.ts"));

  it("does not include personal email addresses or absolute macOS home paths", () => {
    const violations: string[] = [];
    const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
    const macHomePattern = /\/Users\/[A-Z0-9._-]+/i;

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const emailCheckContent = content.replace(/@\d+x\.(?:png|jpe?g)\b/gi, "");
      if (emailPattern.test(emailCheckContent)) {
        violations.push(`${displayPath(file)} contains an email address`);
      }
      if (macHomePattern.test(content)) {
        violations.push(`${displayPath(file)} contains an absolute macOS home path`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("uses a maintainer-neutral macOS bundle identifier", () => {
    const infoPlist = fs.readFileSync("apps/macos/Supporting/Info.plist", "utf8");
    expect(infoPlist).toContain("org.agentextensionauditor.app");
    expect(infoPlist).not.toMatch(/io\.github\.[^.]+\./i);
  });

  it("does not embed Apple signing identities or private maintainer fields", () => {
    const violations: string[] = [];
    const appleSigningPattern = /(?:DEVELOPMENT_TEAM|TeamIdentifier)[^A-Z0-9]{0,20}[A-Z0-9]{10}\b/i;
    const certificateSubjectPattern = /Apple (?:Development|Distribution):[^\n(]+\([A-Z0-9]{10}\)/i;

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      if (appleSigningPattern.test(content) || certificateSubjectPattern.test(content)) {
        violations.push(`${displayPath(file)} contains an Apple signing identity`);
      }
    }

    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as Record<string, unknown>;
    expect(packageJson.author).toBeUndefined();
    expect(packageJson.maintainers).toBeUndefined();
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "git+https://github.com/YauLat/agent-extension-auditor.git"
    });
    expect(packageJson.homepage).toBe("https://github.com/YauLat/agent-extension-auditor#readme");
    expect(packageJson.bugs).toEqual({
      url: "https://github.com/YauLat/agent-extension-auditor/issues"
    });
    expect(violations).toEqual([]);
  });
});

function collectTextFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if ([".build", "build", "node_modules"].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTextFiles(fullPath));
    } else if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function displayPath(file: string): string {
  return path.relative(process.cwd(), file) || file;
}

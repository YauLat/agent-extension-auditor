import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyRepair, planRepair, rollbackRepair } from "../src/remediation/index.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; skillPath: string; backupRoot: string; original: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-audit-remediation-"));
  temporaryRoots.push(root);
  const skillPath = path.join(root, "SKILL.md");
  const backupRoot = path.join(root, "private-backups");
  const original = "---\nname: local-skill\ndescription: Local test skill\n---\n\n# Local Skill\n";
  await fs.writeFile(skillPath, original, { mode: 0o640 });
  return { root, skillPath, backupRoot, original };
}

describe("guided remediation", () => {
  it("plans a minimal source metadata change without returning file contents", async () => {
    const { skillPath } = await fixture();
    const plan = await planRepair({
      action: "skill.add-source",
      path: skillPath,
      source: "https://github.com/example/local-skill"
    });

    expect(plan.action).toBe("skill.add-source");
    expect(plan.expectedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.preview).toContain('+source: "https://github.com/example/local-skill"');
    expect(JSON.stringify(plan)).not.toContain("# Local Skill");
  });

  it("rejects unsafe or ambiguous repair inputs", async () => {
    const { root, skillPath } = await fixture();
    const textPath = path.join(root, "README.md");
    const noFrontmatterPath = path.join(root, "nested", "SKILL.md");
    const symlinkPath = path.join(root, "linked", "SKILL.md");
    const existingSourcePath = path.join(root, "existing-source", "SKILL.md");
    await fs.writeFile(textPath, "# Readme\n");
    await fs.mkdir(path.dirname(noFrontmatterPath), { recursive: true });
    await fs.writeFile(noFrontmatterPath, "# Missing frontmatter\n");
    await fs.mkdir(path.dirname(symlinkPath), { recursive: true });
    await fs.symlink(skillPath, symlinkPath);
    await fs.mkdir(path.dirname(existingSourcePath), { recursive: true });
    await fs.writeFile(existingSourcePath, "---\nname: existing\nsource:\n---\n");

    await expect(
      planRepair({ action: "skill.add-source", path: skillPath, source: "http://example.com/repo" })
    ).rejects.toThrow("HTTPS");
    await expect(
      planRepair({ action: "skill.add-source", path: textPath, source: "https://example.com/repo" })
    ).rejects.toThrow("SKILL.md");
    await expect(
      planRepair({ action: "skill.add-source", path: noFrontmatterPath, source: "https://example.com/repo" })
    ).rejects.toThrow("frontmatter");
    await expect(
      planRepair({ action: "skill.add-source", path: symlinkPath, source: "https://example.com/repo" })
    ).rejects.toThrow("symbolic link");
    await expect(
      planRepair({ action: "skill.add-source", path: existingSourcePath, source: "https://example.com/repo" })
    ).rejects.toThrow("already contains source metadata");
  });

  it("refuses hard-linked targets and non-private backup directories", async () => {
    const { root, skillPath, backupRoot } = await fixture();
    const hardLinkDirectory = path.join(root, "hard-link");
    const hardLinkPath = path.join(hardLinkDirectory, "SKILL.md");
    await fs.mkdir(hardLinkDirectory);
    await fs.link(skillPath, hardLinkPath);

    await expect(
      planRepair({ action: "skill.add-source", path: hardLinkPath, source: "https://example.com/repo" })
    ).rejects.toThrow("hard links");

    await fs.mkdir(backupRoot, { mode: 0o755 });
    await fs.chmod(backupRoot, 0o755);
    await fs.unlink(hardLinkPath);
    const plan = await planRepair({
      action: "skill.add-source",
      path: skillPath,
      source: "https://example.com/repo"
    });
    await expect(
      applyRepair({
        action: "skill.add-source",
        path: skillPath,
        source: "https://example.com/repo",
        expectedHash: plan.expectedHash,
        confirmed: true,
        backupRoot
      })
    ).rejects.toThrow("private");
  });

  it("requires confirmation and the exact preview hash before applying", async () => {
    const { skillPath, backupRoot } = await fixture();
    const input = {
      action: "skill.add-source" as const,
      path: skillPath,
      source: "https://github.com/example/local-skill"
    };
    const plan = await planRepair(input);

    await expect(
      applyRepair({ ...input, expectedHash: plan.expectedHash, confirmed: false, backupRoot })
    ).rejects.toThrow("confirmation");
    await expect(
      applyRepair({ ...input, expectedHash: "0".repeat(64), confirmed: true, backupRoot })
    ).rejects.toThrow("changed since preview");
  });

  it("applies atomically, creates a private backup, and rolls back", async () => {
    const { skillPath, backupRoot, original } = await fixture();
    const input = {
      action: "skill.add-source" as const,
      path: skillPath,
      source: "https://github.com/example/local-skill"
    };
    const beforeMode = (await fs.stat(skillPath)).mode & 0o777;
    const plan = await planRepair(input);
    const applied = await applyRepair({
      ...input,
      expectedHash: plan.expectedHash,
      confirmed: true,
      backupRoot
    });

    expect(await fs.readFile(skillPath, "utf8")).toContain('source: "https://github.com/example/local-skill"');
    expect((await fs.stat(skillPath)).mode & 0o777).toBe(beforeMode);
    expect((await fs.stat(backupRoot)).mode & 0o777).toBe(0o700);
    expect((await fs.stat(path.join(backupRoot, applied.backupId, "original"))).mode & 0o777).toBe(0o600);

    const rolledBack = await rollbackRepair({ backupId: applied.backupId, confirmed: true, backupRoot });
    expect(rolledBack.restored).toBe(true);
    expect(await fs.readFile(skillPath, "utf8")).toBe(original);
  });

  it("refuses rollback when the repaired file changed afterward", async () => {
    const { skillPath, backupRoot } = await fixture();
    const input = {
      action: "skill.add-source" as const,
      path: skillPath,
      source: "https://github.com/example/local-skill"
    };
    const plan = await planRepair(input);
    const applied = await applyRepair({
      ...input,
      expectedHash: plan.expectedHash,
      confirmed: true,
      backupRoot
    });
    await fs.appendFile(skillPath, "\nUser edit after repair.\n");

    await expect(
      rollbackRepair({ backupId: applied.backupId, confirmed: true, backupRoot })
    ).rejects.toThrow("changed after repair");
  });
});

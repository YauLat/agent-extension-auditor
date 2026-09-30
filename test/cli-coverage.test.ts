import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repo = process.cwd();
let root: string;
beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "auditor-cli-")));
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], { cwd: repo });
});
afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("CLI coverage exit contract", () => {
  it("returns 0 complete, 3 partial, 4 unreadable scope, and supports explicit legacy exit behavior", async () => {
    const project = path.join(root, "project");
    await fs.mkdir(project);
    const args = [path.join(repo, "dist/cli.js"), "scan", "--no-home", "--root", project, "--format", "json"];
    const run = (extra: string[] = []) => spawnSync(process.execPath, [...args, ...extra], { encoding: "utf8" });
    expect(run().status).toBe(0);
    await fs.writeFile(path.join(project, ".mcp.json"), "PRIVATE_CLI_SENTINEL");
    const partial = run();
    expect(partial.status).toBe(3);
    expect(JSON.parse(partial.stdout).coverage.status).toBe("partial");
    expect(partial.stdout + partial.stderr).not.toContain("PRIVATE_CLI_SENTINEL");
    const output = path.join(root, "report.json");
    expect(run(["--output", output]).status).toBe(3);
    expect(JSON.parse(await fs.readFile(output, "utf8")).coverage.status).toBe("partial");
    await fs.writeFile(path.join(project, ".mcp.json"), "x".repeat(524289));
    expect(run().status).toBe(4);
    const legacy = run(["--allow-incomplete"]);
    expect(legacy.status).toBe(0);
    expect(JSON.parse(legacy.stdout).coverage.status).toBe("failed");
    expect(run(["--not-an-option"]).status).toBe(2);
  });

  it("runs the packaged scanner and TOML parser independently of the checkout", async () => {
    const bundled = path.join(root, "runtime");
    execFileSync(process.execPath, ["scripts/package-runtime.mjs", bundled], { cwd: repo });
    const project = path.join(root, "bundled-project");
    await fs.mkdir(path.join(project, ".codex"), { recursive: true });
    await fs.writeFile(path.join(project, ".codex/config.toml"), '[mcp_servers.demo]\ncommand = "node"\n');
    const result = spawnSync(process.execPath, [path.join(bundled, "dist/cli.js"), "scan", "--no-home", "--root", project, "--format", "json"], { cwd: root, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).summary.inventory.mcpServers).toBe(1);
    expect(await fs.readFile(path.join(bundled, "node_modules/smol-toml/LICENSE"), "utf8")).toContain("Redistribution");
  });
});

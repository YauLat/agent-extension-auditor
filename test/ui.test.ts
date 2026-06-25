import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialTerminalUiState, renderTerminalUiScreen } from "../src/ui/terminal.js";
import { scanAgentExtensions } from "../src/scanner/index.js";

const fixtureRoot = path.resolve("test/fixtures");
const home = path.join(fixtureRoot, "home");
const cwd = path.join(fixtureRoot, "project");

describe("terminal ui", () => {
  it("renders category and severity navigation without secret values", async () => {
    const report = await scanAgentExtensions({ cwd, home, generatedAt: new Date("2026-06-21T00:00:00.000Z") });
    const screen = renderTerminalUiScreen(
      report,
      {
        ...createInitialTerminalUiState(),
        categoryIndex: 0,
        severity: "medium"
      },
      { width: 100, height: 40, color: false }
    );

    expect(screen).toContain("Agent Audit UI");
    expect(screen).toContain("Category:");
    expect(screen).toContain("[Skills");
    expect(screen).toContain("Severity:");
    expect(screen).toContain("[Medium");
    expect(screen).toContain("DUPLICATE_SKILL_NAME");
    expect(screen).toContain("Keys:");
    expect(screen).not.toContain("sk-test-should-not-appear");
  });

  it("can render a static non-interactive category snapshot", async () => {
    const report = await scanAgentExtensions({ cwd, home });
    const screen = renderTerminalUiScreen(report, createInitialTerminalUiState(), { width: 80, height: 22 });

    expect(screen).toContain("Local-only. Read-only. No telemetry. No upload.");
    expect(screen).toContain("All findings");
    expect(screen).toContain("Selected");
  });
});

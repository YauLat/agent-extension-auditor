import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("standalone frontend prototype", () => {
  const html = fs.readFileSync(path.resolve("examples/glass-dashboard.html"), "utf8");

  it("ships as a local no-dependency glass dashboard", () => {
    expect(html).toContain("<title>Agent Audit Glass Dashboard</title>");
    expect(html).toContain("class=\"device-frame\"");
    expect(html).toContain("backdrop-filter");
    expect(html).toContain("Standalone local frontend");
    expect(html).toContain("No telemetry, no upload, no account");
    expect(html).toContain("type=\"file\"");
    expect(html).toContain("FileReader");
    expect(html).toContain("Load JSON");
    expect(html).toContain("data-lang=\"zh-Hant\"");
  });

  it("does not depend on external scripts, styles, or fixture secrets", () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toContain("https://");
    expect(html).not.toContain("sk-test-should-not-appear");
  });
});

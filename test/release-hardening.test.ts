import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("macOS release hardening", () => {
  it("keeps package and runtime versions aligned", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as { version: string };
    const runtimeVersion = fs.readFileSync("src/version.ts", "utf8");
    const infoPlist = fs.readFileSync("apps/macos/Supporting/Info.plist", "utf8");

    expect(packageJson.version).toBe("0.3.0");
    expect(runtimeVersion).toContain(`VERSION = "${packageJson.version}"`);
    expect(infoPlist).toContain("<string>0.3.0</string>");
    expect(infoPlist).toContain("<string>4</string>");
  });

  it("keeps local packaging ad-hoc by default and gates release signing", () => {
    const script = fs.readFileSync("apps/macos/scripts/package-app.sh", "utf8");

    expect(script).toContain("MACOS_BUILD_ARCHS:-universal");
    expect(script).toContain("Developer ID Application:");
    expect(script).toContain("--options runtime");
    expect(script).toContain("--timestamp");
    expect(script).toContain("codesign --verify --deep --strict");
  });

  it("removes build-machine paths and fails closed on private artifact data", () => {
    const script = fs.readFileSync("apps/macos/scripts/package-app.sh", "utf8");

    expect(script).toContain("xcrun strip -S");
    expect(script).toContain("reject_private_artifact_data");
    expect(script).toContain("/Users/");
    expect(script).toContain("/home/");
    expect(script).toContain("[A-Z0-9._%+-]+@[A-Z0-9.-]+");
  });

  it("requires explicit Keychain inputs before notarization", () => {
    const script = fs.readFileSync("apps/macos/scripts/notarize-app.sh", "utf8");

    expect(script).toContain("MACOS_SIGN_IDENTITY is required");
    expect(script).toContain("NOTARY_KEYCHAIN_PROFILE is required");
    expect(script).toContain("notarytool submit");
    expect(script).toContain("stapler validate");
    expect(script).toContain("spctl --assess");
    expect(script).toContain("shasum -a 256");
  });

  it("tests the native app on Apple Silicon and Intel macOS runners", () => {
    const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

    expect(workflow).toContain("runner: macos-26");
    expect(workflow).toContain("runner: macos-26-intel");
    expect(workflow).toContain("architecture: arm64");
    expect(workflow).toContain("architecture: x86_64");
    expect(workflow).toContain("swift test --package-path apps/macos");
  });

  it("pins third-party actions and keeps workflow permissions read-only", () => {
    const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toContain("actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5");
    expect(workflow).toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020");
    expect(workflow).not.toMatch(/actions\/(?:checkout|setup-node)@v\d/);
  });

  it("keeps four-digit severity counts on one line", () => {
    const overview = fs.readFileSync(
      "apps/macos/Sources/AgentExtensionAuditor/OverviewView.swift",
      "utf8"
    );
    const countBlock = overview.match(/Text\(count\.formatted\(\)\)[\s\S]{0,300}\.fixedSize\(horizontal: true, vertical: false\)/);

    expect(countBlock?.[0]).toContain(".lineLimit(1)");
    expect(countBlock?.[0]).toContain(".minimumScaleFactor(0.75)");
  });
});

# Inventory evidence and native UI refinement

Status: completed locally — user selected option A (configuration state, incomplete parsing, plugin ownership), then requested animation and interface improvements.

## Goal
Make the scanner's existing evidence visible in the macOS app, with readable hierarchy and restrained native interactions.

## Non-goals
No scanner/rule/schema changes, activation controls, persistence changes, dependencies, remote services, publishing or agent configuration writes.

## Current behavior
Native inventory decoding discards metadata. Cards can show a green clean shield even when parsing failed. Bundled skills do not identify their owning plugin. Cards and page changes lack interaction feedback.

## Proposed behavior
- Decode optional metadata tolerantly; legacy reports remain readable. Invalid metadata is incomplete, never silently interpreted as enabled or clean.
- MCP configuration badges distinguish explicit true, explicit false and unspecified. Runtime execution remains unverified in every case.
- Parsing errors and limited coverage appear on cards and details, with an overview warning count. Display fixed explanations, never raw parser errors.
- Resolve bundled skill ownership only through the reported plugin ID; unresolved relations stay unconfirmed.
- Improve native surfaces, header hierarchy and card feedback. Use brief hover/press and page transitions, respect Reduce Motion and Increased Contrast, and avoid perpetual decorative animation.
- Retain both Traditional Chinese and English. Keep risk counts and established navigation unchanged.

## Files / modules affected
Swift models, inventory/overview/shared components, design system, content view, localization, Swift tests. The existing root project ledger remains the single coordination record.

## Verification plan
1. Add decoder regression tests; observe missing metadata fail before implementation.
2. Verify old reports, malformed fields, true/false/unknown configuration, sanitized error state and exact-ID plugin ownership.
3. Run Swift tests, existing Node checks and diff review. Package a local universal ad-hoc app and verify signing/privacy checks.
4. Inspect the native app, including synthetic incomplete config and plugin ownership; verify normal and reduced-motion policy. Report platform limitations explicitly.

## Risks / rollback
Optional metadata must not break a whole report. Incomplete evidence must not look clean. Large inventories must not receive per-item perpetual effects. Roll back only this UI change set; preserve the previous scanner changes and previous local app bundle.

## Verification results (2026-10-01)
- Observed decoder regression tests fail before implementation; all 13 Swift tests now pass, including seven metadata regression cases.
- Existing 57 Node tests, TypeScript noEmit/build and diff whitespace checks pass.
- Universal arm64 / x86_64 local package built; privacy scan and strict deep code-signature verification pass with ad-hoc signing.
- Native UI checked against scanner-generated synthetic data for all three configuration states, parsing failure, limited coverage and bundled plugin ownership. Switching an open inspector to a narrow sheet preserves selection after animation.
- Normal local scan succeeds and renders thousands of items. Card hover/press, page and count transitions are brief; no perpetual effects.
- Reduce Motion, Increased Contrast and Reduce Transparency branches are implemented and reviewed, but system settings were not changed for live verification. Intel runtime and notarized distribution remain unverified. No settings writes, installation or publishing performed.

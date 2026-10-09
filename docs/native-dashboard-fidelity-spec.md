# Native dashboard reference fidelity correction

Status: authorized by the user's request to move the original preview into the App and subsequent rejection of the divergent native implementation. Local presentation correction only; no additional authorization is inferred.

## Goal

Reproduce the original reviewed dashboard's composition in native SwiftUI. At a 1440-point window, the working area must use the reference's warm canvas, white cards, green navigation selection, 224-point sidebar, 28-point workspace margins, 20-point column gaps and 286-point action rail. Compare the actual App with the original 1440 CSS-pixel specimen, rather than accepting compilation as visual proof.

## Non-goals

No WebView, website delivery, scanner/model/schema/decision/permission changes, dependencies, global macOS appearance change, installation, upload or publication. Retain all real navigation, search, scope, baseline and review actions. Prototype-only state controls and fictional data do not become App controls.

## Current behavior

Source a0ba3c9 follows system dark appearance, native blue sidebar selection, oversized decorative icons, a full-width multi-line coverage band above the page title, icon-based summary metrics and a 320-point rail. The priority item lacks the reference's outlined inner card and short path with line. The user explicitly rejected the visual divergence.

## Proposed behavior

- Default the App window to the original light appearance. An in-memory light/dark display toggle may retain access to the existing dark palette; it changes neither global appearance nor stored preferences.
- Use native SwiftUI buttons in a quiet sidebar with green selected backgrounds. Group inventory categories behind a disclosure, retaining all categories and keyboard-accessible controls. Keep scope/settings reachable. Avoid native List selection overriding the requested green.
- Place existing folder, Home, language and scan controls in a compact 67-point working-area header. Native macOS window controls remain native.
- Page heading has plain 27-point text and a 13-point subtitle, without a decorative icon tile. Complete/current coverage is a compact status line below the heading; incomplete, unknown and stale reports remain explicit with access to their exact inspected scope.
- Match the summary strip's three text-only metrics, 30-point values, captions and vertical separators.
- Match priority card hierarchy: header and view-all link, outlined finding card with severity/disposition, title, asset/state, relative path plus line, detail affordance, then a quiet explanatory inset. Full path remains in detail/help. Do not remove warnings or change prioritization.
- Match full severity rows with fine separators and a compact inventory summary. Baseline remains real and guarded, with its existing warnings and actions styled within the narrow rail.
- At widths below 1150, use the reference's 196-point navigation and stacked action rail. Preserve existing inspector/sheet behavior and list keyboard selection.

## Files/modules affected

Native App scene, ContentView, SidebarView, OverviewView, Components, CoverageView, DesignSystem and BaselineReview presentation; narrowly necessary search presentation if removing the system toolbar requires it. Existing model and scanner files remain unchanged.

## Verification plan

1. Run the existing native tests and inspect the diff for unintended behavior changes.
2. Quit the owned App normally, build a universal ad-hoc bundle at the existing authoritative path (packager preserves the prior bundle), then verify its identity and signature.
3. Actually render the four-skill/one-Critical synthetic report at 1440, 1024 and 940 points. Save screenshots/accessibility states; directly compare the 1440 App with the original dashboard-wide.jpg.
4. Exercise priority navigation, Chinese search, no-match/clear, inventory category disclosure, existing scope controls and stale report warning. Verify selected detail survives wide/narrow resizing. Do not save baseline/review decisions.
5. Verify default light rendering even while macOS uses dark appearance; exercise the App-only appearance control and return to light. Record limits honestly, including human acceptance.

## Risks / rollback notes

Custom sidebar buttons must retain native keyboard focus and accessible labels. A narrow action rail may stack long baseline buttons. Native window chrome and real controls differ from prototype-only buttons; these differences must be explicit. Revert this presentation diff to a0ba3c9 and reopen the recoverably preserved bundle if necessary. No migration or user-data deletion.

## Visual reference

The local original dashboard-preview.html and dashboard-wide.jpg under output/review-20261003/ui-20261008 are the concrete reference. CSS tokens and geometry were read before implementation. Warm canvas #F6F5F2, white #FFFFFF cards, primary #262A27, secondary #656B65, green fill #83D46D and selected text #183516 take precedence over generic native styling.

## Verification outcome

Local implementation and agent-operated verification completed on 2026-10-09; human visual acceptance remains pending. The 2026-10-08 native suite passed 43 tests with zero failures, including the existing synthetic 30,000-finding model regression. Only the final brand text sizing and README adjustment followed that run; the resulting universal release bundle and its actual native UI were verified separately.

The final bundle rendered the four-skill/one-Critical report at 1440, 1024 and 940 points. The narrow brand stays on one line. Priority navigation opened the correct evidence at line 7; Command-F focused native search, pasted Traditional Chinese matched one result, clearing restored it, and no-match retained the full report's pending count. All six inventory categories remain reachable; an empty MCP category retained the overall finding count. Resizing a selected wide inspector to a 1024-point window opened the same finding in a native sheet, and Escape closed it.

Before the final brand-only correction, the candidate also verified App-only dark/light display, stale-scope warning and safe rescan, English narrow layout, and read-only comparison without accepting a baseline. Dated evidence, exact bundle identities and source hashes are recorded in the private ui-fidelity-20261008 report and verification receipt. Scanner dist, schemas, parser runtime, licenses and privacy notice match source; deep/strict ad-hoc verification passed.

The reference's composition is reproduced, not a claim of pixel identity: native window chrome, real controls, timestamps, OS scrollbars and actual evidence remain. No fresh 30,000-finding GUI performance run, full VoiceOver/preference matrix, actual Intel/clean Mac runtime or human usability study was performed for this correction.

## Post-push CI correction — 2026-10-09

- Goal: restore the existing single-line severity-count contract without changing the accepted dashboard composition.
- Non-goals: no scanner, model, ruleset, workflow, permission, dependency or release change; no relaxation of the existing release-hardening assertion.
- Current behavior: CI and a local targeted reproduction fail because the old static guard searches for `Text(count.formatted())`, whereas the new severity row renders the count directly from the report and omitted the prior single-line/scaling/fixed-size modifiers.
- Proposed behavior: restore those modifiers on the actual severity-count text; point the existing static check at that expression and make a missing expression fail explicitly.
- Files/modules affected: OverviewView.swift, test/release-hardening.test.ts and this specification only.
- Verification plan: retain the failing reproduction, confirm the existing check also rejects the updated expression before the modifiers are restored, then run Node lint/all tests/rule evaluation and the native suite. Commit/push the bounded correction under the existing UI repair and branch-push authorization, and verify all remote CI jobs for the exact new SHA.
- Risks / rollback notes: source inspection alone does not prove rendered large-count layout. Native compilation/tests and both CI architectures remain required; the preceding accepted App and screenshot retain their dated artifact identity. Revert only this bounded correction if required; no migration or user-data change.

Local verification: the original check failed on the pushed source; the updated check also failed before the count modifiers were restored. After the fix, lint, all 173 Node tests across 15 files, the 60-case frozen synthetic rule evaluation and all 43 native tests passed. The original CI run passed both macOS jobs and failed this one Node assertion; the correction still requires an exact-SHA remote CI result after push. These checks do not claim new native screenshot or user-device Intel evidence.

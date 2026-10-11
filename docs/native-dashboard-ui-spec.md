# Native dashboard refinement

Status: implemented and locally verified on 2026-10-08. The user explicitly instructed moving the reviewed design into the App UI; the HTML specimen is visual reference only. This approval covers the scope below under section 11, with no external action. Human usability acceptance remains unverified.

## Goal

Make the native Mac review workspace calm, readable and action-oriented. Adapt the explicitly requested soft-dashboard-design reference to SwiftUI: warm neutral canvas, opaque cards, restrained green selection, and state → explanation → next action. An operator should see current risk and the first review action before baseline administration.

## Non-goals

No scanner/ruleset/severity/gate/coverage changes, persistent data model changes, new dependencies, web replacement, accounts, upload, telemetry, installation, publication or extension execution. No charts without measured historical data. No hidden warnings or automatic acceptance. No new density preference stored on disk.

## Current behavior

Observed on the retained 0.3.2 native bundle, source commit 54b0707, during local agent-operated testing on 2026-10-08:

- Initial review supports folder selection, installed/package scope and Home exclusion; a synthetic package produced four skills and one Critical finding, consistent with the CLI.
- The overview places a large privacy strip and baseline card before the priority list and severity totals. Five separate severity cards and six inventory cards consume most of the page.
- A priority heading says “First 5 findings” even when one finding exists.
- Finding rows repeat title/message and stack several metadata lines. Long paths become very faint and truncated. Details use separate rounded fields for nearly every paragraph.
- Switching the shell to Traditional Chinese leaves scanner titles, recommendations and explanations in English. These are scanner-owned report fields, not proof of a localization failure in scanning.
- Coverage, full risk totals, content-bound decisions and explicit unknown execution state are valuable and must remain visible.
- Changing the selected root retains the previous report. The next implementation should make the report's inspected scope distinct from the next scan's chosen scope.
- Fresh folder-switch testing confirmed the mismatch: the toolbar changed to a one-skill folder while the retained four-skill/one-finding report still displayed complete coverage without a stale-scope indication. A rescan correctly produced one skill and zero findings.
- Search/no-match and clear-filter behavior work. The no-match title says “No findings” although the full-report review denominator still correctly shows one; the presentation should explicitly describe a filtered empty result.

These observations are agent-operated inspection, not five-user usability results.

## Proposed behavior

### 1. Native visual system

- Keep NavigationSplitView, native toolbar, SF Symbols, native lists, keyboard selection, sheets and inspector.
- Light colors: canvas #F6F5F2, surface #FFFFFF, text #262A27, secondary #656B65, accent fill #83D46D with text #183516. Semantic risk labels retain their meanings and text/icons.
- Provide explicit dark surfaces and readable corresponding accent/semantic colors. Increased contrast and reduced transparency use opaque surfaces with stronger boundaries. Reduced motion retains stable geometry.
- Sidebar target 220–240 points; page title 24–28 points; body 13–15 points. Align edges on a 4/8/12/16/24/32 spacing scale.
- Use fine boundaries, small downward shadows and 16–20 point card radii. Remove decorative working-area gradients, Liquid Glass from data cards and hover lift/scale on working records. System window chrome can retain its native appearance.

### 2. Overview and first scan

- Compact header with report time, selected scope and existing rescan action.
- One summary strip: inventory total, finding total, pending review total. The exact same report supplies all totals; show unknown when no report exists.
- Primary column: existing first-priority findings and compact full severity breakdown. Secondary rail: existing baseline comparison and inventory summary; retain all baseline warnings and guarded actions.
- Priority title reflects the actual displayed count; zero findings gets an explicit empty state with no safety certification.
- First scan keeps the existing two scope options and controls, with a concise explanation and one visually primary scan action. Privacy moves to a compact line rather than a competing green banner.
- Keep selected next-scan scope separate from inspected report scope. If the scope changes, explicitly state that the displayed report belongs to the previous scan and offer the existing rescan action. Do not discard the old report when cancellation or failure occurs.

### 3. Findings, inventory and detail

- Findings keep existing All/New+changed, severity, rule and search filters. Counts remain full-report counts where specified; filtered counts are explicitly labeled.
- Distinguish an empty report from no matching filters. In the latter state, state that filters have hidden the results and offer the existing clear-filter action.
- Make the title and severity the first row; combine disposition/change/activity metadata onto wrapping lines. Remove redundant short message from the list only when it adds no information; preserve it in details. Paths use readable secondary text and middle truncation; full path/line remains selectable in details.
- Details group location/evidence first, explanation/impact/limits together, and review decision/action together. Keep all content and existing content verification/write guards. Never execute a matched command.
- At wide widths, show overview main column and action rail; at 1024 and 940 point windows, stack the rail and use existing modal finding details below 1100. Preserve selection during resize and filters when opening/closing details.
- Inventory retains all categories, evidence states and selection; apply the same opaque surface and spacing language.
- Native presentation may provide fixed Traditional Chinese guidance for known rule IDs, alongside an accessible English original. Unknown/custom rule fields fall back to the original; never translate inspected source or mutate report fields. This is a presentation adapter, not a ruleset change.
- Include the displayed Chinese finding title in the in-memory findings and inventory search indexes, retaining original fields and unknown-rule fallback. Baseline action labels stack when the rail cannot fit their full text.

## Files/modules affected

apps/macos/Sources/AgentExtensionAuditor/{DesignSystem,Components,SidebarView,ContentView,FirstScanView,OverviewView,FindingsView,InventoryView,CoverageView,AuditStore,BaselineReview,FindingReviewIndex}.swift; DashboardPresentation.swift; narrowly relevant native tests; apps/macos/README.md. CLI and persisted schemas remain unchanged.

## Verification plan

1. Review a local interactive HTML design specimen using a synthetic four-skill/one-Critical fixture. Label it as a proposal, preserve consistent totals, exercise navigation, search/no-results, details/Escape/focus and loading/error/partial/empty examples. Check 1440/1024/390 CSS-pixel views; phone is only prototype reflow, not a native mobile app promise.
2. After approval, implement SwiftUI and run the existing native suite. Add meaningful regression coverage for displayed priority counts, presentation fallbacks and stale scope state if implemented; start with invalid/unknown states. Retain earlier unaffected Node/schema checks.
3. Package to a new private build directory, compare bundled scanner files with the tested source and verify local ad-hoc signature. No installation or publication.
4. Exercise actual native first scan, four-skill/one-finding report, priority→detail→close, filter/no-result/reset, baseline comparison, content verification and unchanged write guards. Test 1440,1024,940 point widths, selected detail resize, long Chinese/path text and available accessibility states.
5. Recheck the real 30000-finding fixture for unchanged totals/search/keyboard/cancellation after UI changes. GUI timings are not frame p95 unless actually measured. Record architecture and bundle identity; no clean-Mac or Intel-runtime inference.

## Risks / rollback notes

SwiftUI sidebar tint and system chrome vary by OS; preserve native controls instead of imitating browser pixels exactly. Large title/row reductions must not remove evidence or keyboard access. Translation helpers require fallback and should not imply that English source text has been validated. Old report preservation requires an explicit stale-scope indication rather than concealing failures. Layout can be reverted by reverting this UI-only diff; keep the existing 0.3.2 bundle available. No migration or user-data deletion.

## Approval scope

Approve local native presentation/layout/localization and stale-scope indication described above, plus local tests/build verification. Existing manual decision and baseline semantics stay as previously approved. No external action is included.

## Implementation and verification record — 2026-10-08

- Native SwiftUI implementation retains NavigationSplitView, List selection, toolbar, sheets, inspector, folder picker and existing guarded review actions. The browser specimen is not part of the App runtime.
- Reproduced Chinese-title search returning zero for a displayed known-rule translation. Added the translated title to both in-memory indexes; original and unknown-rule fields remain intact. The new regression failed before the fix and passed afterward.
- Four new presentation/scope regressions and the existing suite passed: 43 tests, zero failures, in both default Debug and real 30,000-finding report runs. The real-report run preceded the final baseline-label layout change; those model/index paths were unchanged afterward. Final default suite and package logs are retained in the private verification receipt.
- Actual arm64 App: first scan read four synthetic skills and found one Critical at line 7; full-report pending one remained while filtering to zero, and clearing restored the finding. Chinese findings/inventory search, full English original, content-verification guard, priority navigation and keyboard selection worked.
- Native windows at 1440, 1024 and 940 points were inspected. Narrow layout stacked the overview rail. Selected finding survived inspector-to-sheet resizing and Escape; full path/line remained accessible. English baseline buttons wrapped into a vertical stack without truncation.
- Changing root explicitly labeled the retained report as belonging to the prior scope. Rescanning the safe scope produced one skill and zero findings without a safety certification.
- Actual 30,000-finding GUI scan read 1,500 files/skills, preserved the full 30,000 pending denominator, displayed five priorities, and narrowed a chosen query to 20 findings. Down/Up selected lines 10/11/10 with matching detail. Cancellation preserved the previous report and restored controls; the single action-to-accessibility observation was 1,736 ms, not a frame percentile. Baseline comparison completed without accepting it or saving a review decision.
- Static palette checks detected two light selected-filter contrast pairs below 4.5. Darkened the High/Low light colors to #AB3818/#306B33, with unchanged dark colors. Static calculations and native rendered accessibility are recorded separately.
- Universal release packaging, ad-hoc deep/strict signature, artifact privacy scan, scanner/schema/parser parity and idle process identity were checked. x86_64 compilation does not prove Intel runtime behavior.
- Evidence: private output/review-20261003/ui-20261008/NATIVE-UI-REPORT.zh-Hant.md, native-verification.json, native-final-* accessibility captures/screenshots and dated logs. Source/UI checks do not establish human acceptance, a clean-Mac run, light rendered appearance, full VoiceOver/accessibility settings, or SwiftUI frame/input p95.

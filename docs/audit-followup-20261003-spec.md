# Audit follow-up — local implementation

Status: approved local scope; follows the approved product-review-ready spec and the user's instruction to repair and optimize the audited product. External release remains outside this scope.

## Goal
Close the three reproduced exfiltration misses, reduce duplicate configuration warnings, make agent failures actionable, and improve the first five review items.

## Non-goals
No activation, execution of inspected extensions, dependency installation, automatic trust decisions, credential access, publication, migration, or deletion of user data.

## Current behavior
Chinese instruction bypass and direct Python/JavaScript environment uploads yield no finding. Structured MCP secrets also produce a redundant text warning. JSON errors conceal stale-review and missing-review causes. Archived paths can dominate the overview; recommendation text is repeated.

## Proposed behavior
Use bounded static English/Chinese intent and direct environment-to-HTTP-call heuristics, with code/documentation evidence and runtime activity remaining unknown. Preserve all findings; prioritize current scope before explicit archive path segments and disabled MCP configuration. Retain structured secret locations without the redundant file-level copy. Add safe reason, retryable and nextAction fields to existing JSON error codes. Hide identical remediation text.

## Files/modules affected
Scanner, rule definitions/docs, CLI error contract, finding review ordering, Swift overview/detail, tests, version and release notes.

## Verification plan
First add benign/invalid controls and reproduced attack cases; observe failures, implement, run full Node and Swift checks plus frozen evaluation. Rebuild a separate local artifact and re-run the audit probes. Review the final diff for privacy, regression and scope.

## Risks / rollback
Heuristics can miss indirection, obfuscation and other languages; proximity does not prove data flow. Documentation remains review evidence. No automatic verdict. Detection changes require a ruleset bump and manual baseline review. Changes are local Git diffs; preserve earlier app artifacts and the divergent primary checkout.

## Machine-contract and scale verification follow-up

Formalize the already approved output contracts as JSON Schema 2020-12 documents: schema-2 scan reports and safe errors, schema-1 baseline snapshots, and versioned baseline success responses. Preserve current output, additive optional fields, and the separate baseline-diff schema. Use an existing local JSON Schema validator without adding dependencies. Validate real CLI output plus malformed/privacy/runtime-active negative controls. Measure a synthetic 30,000-finding report through decoding, cached review, filters and the native UI; keep scanner time, UI automation round trips and process RSS distinct. This does not introduce persisted disposition state, trust decisions, public execution or a new product workflow.

The scale probe also checks repeated native filtering. If the same query/rule is evaluated multiple times during a SwiftUI update, cache one matching-review result and invalidate it on the next report/query/rule. Preserve severity/category/path-fallback behavior and verify cache invalidation; short-circuit path lookup when item ownership already matches. This is an internal performance change within the approved native review scope.

## Native cold-query and report preparation follow-up

Keep review/search semantics unchanged while reducing repeated work: calculate IDs once for sorting, rank unique display paths using the same localized comparator (equal-comparing paths share a rank), and pool normalized search text for identical searchable fields. Keep the index in memory only, bounded by the current report, and replace it when a new report arrives. Do not add persisted state, a runtime trust label, or a new workflow. Verify ordering against the existing comparator across case/numeric/Unicode/path ties, and search equivalence across every searchable field and query changes. Measure the same real 30k report before/after, separate cold preparation from query latency and memory, then rebuild and exercise the native App.

Prepare the derived native index on a background task during scans, then commit report and index together on MainActor. The previous report/selection remains visible while preparing; cancellation is checked again before commit. Keep synchronous applyReport for already available reports/tests. Verify a deterministic cancellation while preparation is suspended, rejection of overlapping scans, and preservation of the previous report/selection. No unchecked Sendable assertion or new serialized data model is introduced.
### Native measurement metadata correction

Goal: label focused XCTest evidence with its actual compile configuration. The optional release command exposed a hard-coded Debug description. Add a compile-configuration field and use it in the limits text; scanner/report contracts and application behavior stay unchanged. Verify focused debug and release commands against the same 30k report and retain earlier logs as historical evidence. Rollback affects only test evidence metadata.

## Shared-text matching follow-up

Goal: remove repeated substring comparisons for findings that already share identical searchable fields. The current 30k scanner fixture has 1,500 unique field groups, yet one cold query evaluates all 30,000 rows. Keep one immutable normalized-text/rule entry per group and an entry ID for each ordered finding. Evaluate query/rule once per group, then select findings in their existing order. Do not change normalization, matching semantics, severity/category filters, report identity, cancellation, cache invalidation, or serialized output. Changes affect FindingReviewIndex, AuditStore and existing regression/measurement tests only, plus documentation.

Before implementation, strengthen the localized/Unicode equivalence fixture with distinct finding IDs and combinations of matching/nonmatching rule and severity filters so order and missing results are observable. Run that reference comparison against the existing implementation. Afterwards run native regressions, the same real 30k debug and release measurements, and native App scan/search/detail observations. Measure a no-shared-text control separately; do not generalize the 20-fold shared fixture to all reports. No portable timing assertion or new dependencies. Retain earlier bundles/logs. Rollback is the local diff; memory remains bounded by the current report and the single current query cache. No new product workflow or persisted model.

## Navigation rendering follow-up

Goal: prevent the departing Findings view from rebuilding a full 30k-row AppKit list when navigation clears its shared search filter. Reproduction: from a 20-result search, select Skills; CUA times out twice, the test App consumes one CPU core and grows beyond 2 GiB RSS. A system sample places the main thread in OutlineListCoordinator / NSTableView automatic inserted-row preparation, not the scanner. Hypothesis: filter reset reaches the outgoing Findings view during section replacement.

Proposed behavior: only supply list rows to FindingsView while Findings is the selected section. Preserve all store queries, ordering, active-view rows, selection, keyboard behavior and sidebar filter-reset policy. Files: FindingsView only, plus this spec/evidence. No persisted state, dependencies, new workflow or data migration.

Verification: compile and run existing native regressions; build a separate local App; reproduce 30k scan, narrow query, switch to Skills, then return to Findings and inspect grouping and query results. Treat success as a single local GUI observation, not a general latency guarantee. If the GUI still stalls, retain the new evidence and revert this narrow change unless independently useful. Rollback is this local view-only diff; previous artifact remains.

## Ownership fallback verification follow-up

Goal: freeze the current missing/unknown-owner path semantics before optimizing the remaining repeated inventory scan. This step changes tests only. Preserve: a valid owner ID overrides path fallback for per-item ownership; missing/unknown IDs select the first matching inventory item in original input order, not necessarily the deepest path. Category filtering independently accepts any matching item path. A sibling prefix without the slash boundary must not match. Overlapping skill/plugin paths can therefore appear in both category lists while retaining exactly one per-item owner.

Files: existing native test file plus this spec/evidence. Verification: cover valid/missing/unknown IDs, reversed overlapping inventory order and sibling boundary; run the full native suite. No App behavior, schema, persistent model or dependencies change. Rollback is this test-only local diff. Subsequent optimization must preserve these frozen contracts and benchmark missing-owner data separately from the existing all-valid-ID fixture.

## Owner/path index follow-up

Goal: remove the O(findings × inventory) missing/unknown-owner lookup and category path filter without changing their semantics. Current behavior scans inventory per unmatched finding and again for category filtering. Build a report-local exact-path lookup keyed with Swift String equality; enumerate slash boundaries in each finding path, validate candidates with the existing equality/hasPrefix predicate, and aggregate the earliest original inventory index plus all matching category types. Preserve empty/root/trailing/repeated-slash and canonically equivalent Unicode behavior; never normalize paths or choose the deepest owner. Valid IDs still override per-item fallback, while category membership independently unions valid-ID type(s) and matching paths. Memoize literal UTF-8 paths within the report. Store category membership by queue position so duplicated finding IDs do not merge rows.

Files: FindingReviewIndex, AuditStore and native regression/measurement tests. Internal derived memory only; no serialized model, workflow, schema, dependencies or version changes. Verification: reference equivalence over edge paths, reversed inventory, valid/missing/unknown owners, category/severity/query combinations and duplicate IDs; first run baseline 30k missing-owner control, then full native regressions and Debug/Release missing/unknown/all-valid controls. Timings exclude SwiftUI and scanner; no portable timing assertion. Keep original fixtures/logs/artifacts. Rollback: local diff; all derived indices are replaced together with the report. Existing background cancellation-before-commit contract remains.

## Severity filter render follow-up

Goal: eliminate repeated category/query work for each severity button during navigation. The latest owner-index App sample shows SeverityFilterBar calling severityScope→inventory→String.contains repeatedly while replacing a searched Findings page with Skills. Current six buttons each resolve the complete scope. Compute one report-local severity tally per body evaluation, retaining the current category inventory ownership, query/rule behavior and ignoring the selected severity for counts. No layout, text, selection, keyboard, filter policy or serialized models change.

Files: Components.swift, AuditStore.swift and native tests. Verify empty input, all severities, query/rule changes, category ownership and report replacement against existing severityScope; freeze a30k six-call baseline, compare one tally, run native checks, package separately and perform actual30k navigation/search/selection/cancel. Timings are exploratory data-layer/AX observations, not a portable CI threshold. Review the final local diff; rollback is this narrow diff, prior artifacts remain.

## Inventory query index follow-up — 2026-10-04

Goal: avoid constructing/lowercasing inventory and owned-finding search strings and localized-sorting inventory on each query. Previous one-tally query still costs121–136ms on30k/1500 synthetic data. Build immutable report-local item text, separately pooled rule/title/message text and severity membership; retain sorted positions per category. Cache only the current normalized query's matching positions, invalidate on report replacement, apply severity independently.

Non-goals: no UI layout/workflow, persisted model/schema, rule selection policy, finding identity/evidence, scanner, dependency or runtime changes. Inventory search must not gain global finding path/recommendation fields. Category inventory continues to ignore selectedRuleID, count scope ignores severity, ownership/duplicate IDs and sorting ties retain existing behavior.

Current behavior: each inventory request filters raw items, lowercases joined item name/path/displayPath/source and owned finding rule/title/message, then sorts with localizedStandardCompare. Proposed behavior: precompute precisely these fields once while preparing the existing background report index; one query evaluates each pooled finding text once, then item positions; category and severity select from preordered positions.

Files: FindingReviewIndex.swift, AuditStore.swift, native reference/measurement tests, evaluation/CHANGELOG and local evidence/report/sole ledger. Verification: current algorithm reference across all categories, query/Unicode/newline boundaries, rule/severity combinations, duplicate IDs, missing ownership and report replacement; real synthetic30k baseline/final Debug and Release measurements including unique-message control; native regression suite and separate packaged App scan/search/navigation/detail. Timings remain diagnostic, no portable wall-clock assertion.

Risks/rollback: extra report-local text/membership memory and index preparation cost; unique text may receive less pooling benefit. Preserve both before/after receipts and bundles; local diff rollback. Background-index cancellation behavior remains unchanged; no immediate CPU-worker cancellation claim. Full product objective remains partial.

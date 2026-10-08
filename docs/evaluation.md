# Reproducible performance and rule checks

Run from a source checkout with its dependencies already available. Node.js 20+ is required. These scripts do not execute fixture scripts or upload data.

```sh
npm run benchmark -- --sizes 100,1000,5000 --runs 3
npm run evaluate:rules
node scripts/evaluate-rules.mjs calibration
```

## Performance
`benchmark.mjs` creates a synthetic library with three files per skill; every tenth helper contains a remote-script marker. Each sample uses a fresh Node process. Timing covers the scanner call and result digest, excluding fixture creation and process startup. Peak RSS covers the worker process. Report Node/platform/architecture, sample count, complete coverage, file/item counts, digest, median, observed 95th percentile and memory. Three runs are exploratory: the observed p95 is merely the maximum of three, not a reliable tail estimate. OS cache and background load are uncontrolled; do not generalize these numbers to other machines or actual Home inventories.

Use `--engine path/to/dist/scanner/index.js` to compare an existing built engine on the same fixture path. Digests include inventory, findings and coverage (including paths, file modes and content hashes); they are comparable only with identical canonical paths, file modes and compatible detection semantics. A timeout is a lower bound, not a measured runtime. Scope/depth/file-size exclusions still apply to real libraries.

Default fixtures live under the OS temporary directory `aea-scale-fixtures`; use a dedicated `--fixture` directory. The script overwrites only its generated numbered skill files there and leaves them for comparison. Do not point it at user data.

## Rules
The frozen JSON corpus has 100 synthetic template cases (50 positive, 50 negative), 40 calibration and 60 evaluation cases. Its SHA-256 is checked before each run. The evaluation split was not used to tune the implementation; it shares templates/authorship with calibration and is **not an independent or representative security benchmark**. One label correction happened before tuning/evaluation: UNKNOWN_SOURCE evidence is metadata, not documented; the final corpus records that correction.

A positive expects a specific rule, minimum severity and evidence kind. A negative expects no such finding at that threshold, not a safe extension. Documented prohibitions can remain informational findings. The scripts report TP/FP/FN/TN, precision and recall, per-rule and per-evidence totals, incomplete scans and failing IDs. They exit nonzero on failed expectations or incomplete coverage. CI checks the frozen evaluation split; it does not impose noisy wall-clock performance gates.

Nine rule IDs are represented; this is not coverage of every rule. Blind spots include obfuscated/dynamic code, natural-language ambiguity, many languages, indirect exfiltration, quoted executable examples and cross-file intent. It does not measure runtime activation or maliciousness. New independently sourced cases require source/license review, anonymization and human labeling; freeze a new evaluation set before tuning again.

Changing detection semantics increments RULESET_VERSION. Old review baselines must be reviewed/recreated rather than silently treated as compatible.


## Native 30,000-finding verification

Use a new dedicated fixture directory and a new report filename. Existing fixtures/reports are retained; do not point this generator at user data.

```sh
npm run build
node scripts/benchmark-native-scale.mjs /tmp/aea-native-scale-new /tmp/aea-native-scale-new.json
AEA_NATIVE_SCALE_REPORT=/tmp/aea-native-scale-new.json swift test --package-path apps/macos --filter testThirtyThousandFindingReviewAndFilters
```

The generator creates 1,500 synthetic skills with 20 remote-script patterns each, obtains exactly 30,000 findings with complete declared coverage, and never executes commands in the skills. The test uses that real scanner report for three decode/cache/category/search samples; checks counts, matching filters and top-five review; prints `AEA_NATIVE_SCALE` JSON. Without the environment variable, it runs a deterministic 30,000-row model regression. macOS `getrusage` peak RSS is recorded in bytes for the entire XCTest process, including fixture decoding and prior allocations. Store timings exclude scanner time and SwiftUI rendering. Run the focused test without concurrent build/test workloads for an exploratory comparison; do not impose these wall timings as portable CI gates.

For native UI evidence, scan the generated folder as a downloaded package with Home excluded, then check the total count, last-skill search, detail selection and cancellation preserving the report. Record process RSS separately. UI automation click-to-observation times include input and accessibility waiting; they are upper bounds, not precise frame/event latency. Three model samples and a single UI observation do not establish tail latency or clean-machine performance.

Native indexes contain only derived, in-memory data for the current report. Unique display paths retain their original UTF-8 spellings before localized ranking; sorting keys are computed once and repeated searchable fields share normalized text. The scan prepares this index on a background task and checks cancellation before committing on MainActor. An equivalence regression covers numeric/case/Unicode paths, equal path ties, every searchable field and changing queries; a suspended-preparation test checks cancellation preserves the previous report/selection and rejects overlapping scans. A focused release XCTest can provide optimized data-layer measurements (`swift test -c release --filter testThirtyThousandFindingReviewAndFilters`); do not compare its timings directly with a debug baseline or interpret them as SwiftUI event latency.

Cold query/rule matching evaluates each shared search entry once and selects matching findings in the existing order. The equivalence regression uses distinct finding IDs and combinations of Unicode queries, rule IDs and severity filters. The real 30,000-finding fixture contains 1,500 distinct searchable field groups, so its speedup does not predict the same gain for 30,000 distinct groups. Set `AEA_NATIVE_SCALE_UNIQUE_TEXT_CONTROL=1` with `AEA_NATIVE_SCALE_REPORT` to append a synthetic, unique suffix to each finding message before timing. This negative control is reported as a synthetic unique-message control, does not modify the input file, and includes fixture construction in process peak RSS. Report it separately from real scanner evidence.


Native navigation regression: after a 30k scan, narrow Findings to one 20-result skill, select Skills, then return to Findings and repeat the query. Resetting shared filters can otherwise rebuild the outgoing AppKit list and stall in automatic row preparation. FindingsView supplies rows only while its section is selected. Verify actual GUI navigation and counts separately from store tests; a system sample is diagnostic evidence, not an automated UI pass. Preserve the original cancellation criterion (response within two seconds and previous report retained); do not turn all action-to-AX timings into a new two-second acceptance requirement.


Owner/path controls: set `AEA_NATIVE_SCALE_OWNER_CONTROL=missing` or `unknown` with the same report to remove item IDs or replace them with an unknown synthetic ID in memory before timing. Set `AEA_NATIVE_SCALE_UNIQUE_PATH_CONTROL=1` to give each finding a different descendant path while retaining its display path. The source report is not modified. Labels/control flags distinguish these model transformations from an unchanged real scanner report. Category counts are checked against the original linear ID/path predicate outside the timed operation; its expensive reference count is reused across the three samples. This harness reuse changes untimed work, so process peak RSS is reported separately and must not be interpreted as a controlled before/after memory comparison.

The derived path index retains the earliest original inventory owner and all independently matching category types. It uses exact Swift String keys and slash-boundary candidate lookup with the original prefix predicate, without path normalization. A literal UTF-8 path cache is temporary during index construction; category membership uses queue positions, preserving duplicated IDs. Edge/reference regression covers empty/root/trailing/repeated slashes, sibling boundaries, Unicode composition/combining marks/emoji/case, original/reversed/empty inventories, duplicate inventory IDs, valid/missing/unknown owners and category/query/severity combinations. This is static report ownership, not evidence of runtime activity.

Severity-filter rendering: `testThirtyThousandSeverityFilterScopeMeasurement` uses the same `AEA_NATIVE_SCALE_REPORT` input to compare the previous six scope resolutions (All plus five severities) with one scope/tally. It checks empty, last-skill and unmatched queries, three runs each; timings are exploratory and have no portable threshold. The reference-equivalence test covers query/category/selected-rule/selected-severity combinations, empty input and report replacement. Category counts preserve the existing per-item inventory search and ownership policy; the global scope retains its existing rule filter. The selected severity is ignored for the button counts. This removes repeated work without changing the policy or adding persistent state. Record GUI observations separately because store timing does not establish frame or input latency.

Inventory-query verification (2026-10-04): `testInventorySearchPreservesFieldBoundariesOwnershipAndReplacement` compares the original per-item predicate and localized sorting with report-local inventory indexing, across all categories, Unicode/newline queries, matching/nonmatching rule selections, severity combinations, duplicate owners, path fallback, repeated calls and report replacement. Inventory text excludes global finding path/recommendation fields. `testThirtyThousandInventorySearchMeasurement` compares the legacy function with a cold indexed query and a repeated query on the same report; enable with `AEA_NATIVE_SCALE_REPORT`, optionally `AEA_NATIVE_SCALE_UNIQUE_TEXT_CONTROL=1`. Each configuration has three runs, legacy always first; preparation and process RSS are separate, no portable timing assertions. Extra text preparation has a cost, and unique-text controls receive less pooling benefit. Serialized models and GUI layout remain unchanged.

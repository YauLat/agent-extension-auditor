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

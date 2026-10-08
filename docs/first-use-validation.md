# First-use validation protocol

Status: prepared; no recruited users or human results yet. Agent-operated smoke tests and unit tests are not usability evidence.

## Decision and sample
Recruit five people already using Codex or Claude, including at least three unfamiliar with this auditor. Run one 20-minute moderated session each, then a seven-day follow-up. Start recruitment only through an explicitly authorized channel. Use synthetic fixtures; do not collect home-directory scans, credentials or private skill contents.

Before starting, record macOS version, architecture, installed Node version, whether Gatekeeper interrupts launch, and whether the participant previously used the product. Existing developer-machine success does not establish clean-machine readiness.

## Tasks without coaching
1. Open the App and explain what it does and does not execute/upload. Check the Node prerequisite. Target: explanation within 60 seconds.
2. Inspect a downloaded synthetic package, excluding Home. Target: correct scope and first result within three minutes, excluding OS prerequisite setup (record setup separately).
3. Distinguish a documented prohibition, a configured capability and an executable-script pattern. Ask what is confirmed and what remains unknown. Target: all three understood by at least four of five people.
4. Open a finding and locate its supporting file. Target: within 60 seconds, no moderator hints.
5. Compare and create a review baseline. Add one synthetic asset and modify another, compare again, then use All / New + changed to locate them and explain why they require review. Target: at least four of five locate and explain within 60 seconds without hints. Check that full risk/pending counts remain visible, removed assets stay in comparison details, and an empty change queue does not imply safety. Record queue-task time separately; explain why a baseline is not a safety certification.
6. Scan the large fixture; cancel and verify the old report remains. Record visibility and response time; target cancellation acknowledgment within two seconds on the test machine.
7. Check current content, save accepted risk on a synthetic finding, then change its supplied fixture and rescan. Explain why the decision expired, why the warning remains, and how marked false positive differs from a safety verdict. Target: at least four of five complete and explain within 90 seconds without hints. Record whether the save result message is noticed.
8. After seven days, ask whether they independently scanned again and why. Target: at least three of five return; exploratory signal only, not a statistically reliable retention estimate.

## Evidence and decisions
Record task time, success, mistakes, hints and short non-sensitive observations. No raw screen capture or private paths by default. Blank/unknown is not failure or success. Summarize each problem by frequency, consequence and proposed fix. If fewer than four complete scope selection or evidence interpretation, fix those flows before expanding functionality. If Node/Gatekeeper blocks two or more, prioritize distribution/runtime onboarding. Do not modify installation permissions or remove quarantine for the test.

| Participant | Prior familiarity | Runtime/launch setup seconds | Correct scope | First result seconds | Evidence 3/3 | Baseline unaided | New/changed seconds and explanation | Cancel seconds | Decision/expiry unaided | Returned day 7 | Observation |
|---|---|---:|---|---:|---|---|---|---:|---|---|---|
| P1 | pending | | | | | | | | | | |
| P2 | pending | | | | | | | | | | |
| P3 | pending | | | | | | | | | | |
| P4 | pending | | | | | | | | | | |
| P5 | pending | | | | | | | | | | |

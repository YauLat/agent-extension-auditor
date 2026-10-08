# 0.3.2 release readiness

Status: prepared local delivery checklist; no publication, signing-account access, notarization submission, push or installation authorized here.

The 0.3.2 source is maintained on codex/product-review-ready; record the exact commit with the dated local verification receipt before publication. A universal local App and package dry-run establish packaging only. Developer ID, notarization, clean-machine launch and actual Intel execution remain separate checks.

| Requirement | Current evidence | Completion condition / owner |
|---|---|---|
| Source identity | Local branch/base commit and accumulated diff retained | Human reviews final scope; record committed release source before publishing |
| Unit / contracts | 173 Node / 15 files, 39 Swift default and real-30k, six schemas / 49 contract cases; dated 2026-10-04 logs retained | Preserve dated logs tied to the final source; rerun affected checks after new changes |
| Native review workflow | 2026-10-06 responsive App: 30k scan, changed-only 20 with full pending 30k, search 0/20, keyboard/detail match, both resize transitions, close and comparison cancellation observed | Single arm64 developer machine and synthetic inputs; does not replace five-person usability or clean-machine checks |
| Local App integrity | Universal architecture and ad-hoc deep/strict signature; bundled dist/schema hashes | Keep artifact checksum and bundled dependency license receipt |
| Scanner accuracy | Frozen synthetic regression only | Independent, licensed, family-separated human-labeled corpus; report FP/FN and limits |
| macOS prerequisites | Node 20+; arm64 developer Mac tested | Test macOS 14+ on clean arm64 and an actual Intel Mac, including missing/old Node and normal Gatekeeper behavior |
| Public artifacts | Source/npm/App/Release for these changes not published | Human approves exact version and artifacts; verify all four refer to the same source |
| Apple distribution | No submitted notarization / release signing claim | Existing approved Developer ID and Keychain profile; accepted ticket, stapling and Gatekeeper assessment without bypass |
| Human usability | Five-person protocol prepared, no results | Authorized recruitment; at least 4/5 scope/evidence/decision tasks, 3/5 seven-day repeat use |
| Remote CI | Local tests passed | Run the approved remote pipeline on the release commit and inspect actual results |

Before requesting publication approval, prepare the exact changelog, Git diff, package file list, artifact hashes and rollback plan. Never include credentials or private scan reports. Rule evaluator changes must bump RULESET_VERSION; the reserved review directory changes exclusion policy, so older baselines can require explicit review.

The Mac App and scanner must match: the new App always requests --with-reviews. An older AGENT_AUDIT_CLI_PATH override is unsupported. Read-only scans do not create review storage; decision writes require a user-owned root not writable by group/others. Document history limits and fail-closed recovery before distribution.

Release approval does not retroactively prove scanner accuracy or human retention. A local ad-hoc package is suitable for review on the tested machine; it is not a notarized public release. Keep previous artifacts and private decision history during rollback. Any deletion, credentials change or installer/runtime bundling requires its own applicable authorization.

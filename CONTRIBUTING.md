# Contributing

Thanks for helping improve Agent Extension Auditor.

## Project Boundaries

The MVP must stay:

- local-first
- read-only by default
- deterministic
- open source
- free of telemetry, advertising, account creation, and cloud upload
- careful not to print secret values

Changes that install, delete, upload, auto-fix, phone home, or monetize should be discussed before implementation.

## Public Data Hygiene

Do not commit maintainer email addresses, personal names, personal home-directory paths, Apple Team IDs, signing identities, credentials, raw scan reports, or local extension inventories.

Keep package metadata free of private maintainer details. Canonical project repository and issue-tracker URLs are allowed; personal profile URLs and contact addresses are not. Fixtures must use clearly synthetic names, domains, paths, and secret sentinels.

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

## Adding A Rule

Every rule needs:

- a definition in `src/rules/definitions.ts`
- a matching `rules/<RULE_ID>.md`
- fixture coverage when practical
- clear false-positive notes
- no secret value output

Rules should report review-worthy behavior. They should not label an extension as safe or malicious.

## Reports

Report changes must preserve these privacy guarantees:

- no telemetry
- no upload
- no secret values
- no hidden network calls

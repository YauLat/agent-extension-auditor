# Privacy Hardening Spec

## Goal

Keep tracked source and package metadata free of private maintainer details while allowing the user-approved public project account name in canonical repository links.

## Non-goals

- Hide the public project account name.
- Change GitHub or npm account ownership.
- Rename the package.

Those operations are outside this source-level privacy boundary.

## Current behavior

The project uses a clean public Git repository. The tracked source does not contain maintainer email addresses, personal profile URLs, or absolute macOS home paths.

## Proposed behavior

- Allow only the canonical public project `repository`, `homepage`, and `bugs` URLs in `package.json`.
- Keep `author` and `maintainers` absent.
- Document the public-data boundary for contributors and users.
- Add regression coverage so private maintainer metadata is not introduced accidentally.

## Files/modules affected

- `package.json`
- `README.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `test/repository-privacy.test.ts`

## Verification plan

- Run the repository privacy tests.
- Run lint, the complete test suite, and the build.
- Run `npm pack --dry-run` and inspect the package manifest.
- Search tracked files for personal email addresses, absolute macOS home paths, and maintainer-linked account identifiers.

## Risks / rollback notes

The canonical repository URLs expose the user-approved public account name. Removing or transferring that account would require coordinated GitHub and npm metadata updates. Private email addresses and personal profile links remain prohibited.

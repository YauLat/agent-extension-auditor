# Security

## Reporting Vulnerabilities

Please report security issues privately through the repository's security advisory flow when available. If that is not available, open a minimal issue asking for a private contact path without including exploit details.

## Scanner Boundaries

Agent Extension Auditor is a deterministic review tool. It does not guarantee that an extension is safe, and it does not prove that an extension is malicious.

The scanner should remain:

- read-only by default
- local-only
- deterministic
- transparent about rules
- careful not to print secret values

The guided repair path is separate from scanning and must remain:

- explicit and user-confirmed
- deterministic and limited to a documented action
- protected by a preview content hash
- backed up locally before writing
- atomic and permission-preserving
- unwilling to overwrite newer edits during apply or rollback

Silent repair, bulk mutation, install, delete, upload, remote repair, and AI-generated rewrites remain out of scope.

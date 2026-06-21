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

Any feature that installs, modifies, deletes, uploads, or sends data should be treated as out of scope for the MVP.

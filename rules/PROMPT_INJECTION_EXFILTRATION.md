# PROMPT_INJECTION_EXFILTRATION

Severity: high

Detects nearby English or Traditional/Simplified Chinese language asking to bypass prior instructions or safety safeguards, access private credentials, and transmit data. This is a bounded static heuristic, not proof of malicious intent or comprehensive prompt-injection detection.

Review the indicated text, requested information, intended destination, and surrounding context before activating the extension. Decline execution or remove the instruction if its purpose is unjustified. Documentation about attacks can trigger this rule; paraphrases, other languages and distant instructions can evade it. Explicit same-sentence prohibitions remain visible at informational severity. The report never copies the underlying credential or instruction text.

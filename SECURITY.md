# Security Policy

GroupMate connects enterprise chat messages to local agent executors. That makes security part of the core design, not an optional add-on.

## Supported Versions

GroupMate is pre-1.0. Security fixes will target the `main` branch until release channels are established.

## Reporting a Vulnerability

Please avoid opening a public issue for sensitive vulnerabilities.

For now, report privately to the project owner through GitHub account contact methods. A dedicated security contact may be added later.

## Security Principles

- Channel memory does not imply execution permission.
- Execution permission is evaluated per requester and per task.
- Source adapters should keep raw events for auditability where possible.
- Executors should receive bounded context packets, not unrestricted chat history.
- Dangerous operations should require explicit confirmation.
- Secrets should never be written to channel memory or public run logs.

## High-Risk Areas

- Shell command execution through coding-agent CLIs.
- Prompt injection from group chat history.
- Accidental leakage of local files, logs, credentials, or tokens.
- Confusing channel-level trust with requester-level authorization.
- Reusing an elevated executor session across different requesters.

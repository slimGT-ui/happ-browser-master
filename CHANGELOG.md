# Changelog

All notable project changes are documented here.

## [0.10.1] - Release Candidate 1 for 1.0.0

### Release preparation
- Prepared a candidate build for persistent-installation and update-lifecycle verification.
- No diagnostic behavior or permissions were intentionally changed from the manually verified 0.10.0 preview.
- This candidate is not the stable 1.0.0 release. Stable publication depends on signed-installation, update-preservation and permission-lifecycle checks.


## [0.10.0] - Preview

### Added
- Diagnostic Timeline with day grouping, per-check filters and activity summary.
- Change detection between consecutive results of the same diagnostic type.
- Automatic restoration of the last Public IP, DNS, WebRTC, IPv4/IPv6 and website results when the popup is reopened.
- Serialized history writes to prevent simultaneous diagnostics from overwriting each other's entries.
- Clear distinction between complete, partial and inconclusive IPv4/IPv6 reachability results.
- Reproducible local validation commands through npm scripts.

### Fixed
- WebRTC candidate classification now uses the shared, defined IPv4/IPv6 validators.
- Security Overview refreshes after a diagnostic is saved.
- Timeline and Security Overview no longer present a one-family IPv4/IPv6 result as a complete result.
- Removed the obsolete staged-diagnostics label from the interface.

### Validation
- Automated regression suite and Firefox manual verification are required before a stable release.
- This is a preview release; it is not a security certification and does not guarantee that a VPN has no leaks.

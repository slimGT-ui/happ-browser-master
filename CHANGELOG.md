# Changelog

All notable project changes are documented here.

## [1.0.0] - Stable

### Release
- First stable release of HAPP Browser for Firefox.
- Includes Public IP, DNS observations, WebRTC ICE diagnostics, IPv4/IPv6 reachability and Website Reachability.
- Adds Security Overview, VPN profile comparison, JSON diagnostic export and a persistent 50-event Diagnostic Timeline.
- Keeps diagnostic history and saved profiles in local Firefox storage; no first-party telemetry or automatic report upload.
- Verified through 23 core manual scenarios, 5 focused regression scenarios, 4 persistent-installation lifecycle scenarios and 30 automated tests.
- DNS, WebRTC and IPv6 findings remain diagnostic observations, not an absolute guarantee that a VPN is leak-free.


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

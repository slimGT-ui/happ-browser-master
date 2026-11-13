# HAPP Browser — release checklist

This checklist is for preparing a stable Firefox add-on release. Do not create the 1.0.0 tag until all applicable checks are complete.

## Scope

- Firefox only.
- Diagnostic companion, not a VPN client or tunnel.
- No HAPP Desktop profile enumeration, connection control or synchronization is claimed.
- No automatic verdict is made from DNS resolver presence or IPv6 availability.
- No result is an absolute guarantee that a VPN is leak-free.

## Automated checks

- [ ] Run `npm run validate` with Node.js 20 or newer.
- [ ] Confirm GitHub Actions is green for the exact release commit.
- [ ] Confirm manifest, popup, README, package.json and diagnostic report versions match.
- [ ] Review the final diff and ensure no debug files, credentials, test dumps or local data are packaged.

## Firefox functional checks

- [ ] Install the packaged extension in a clean Firefox profile.
- [ ] Public IP: normal response, service failure and recovery.
- [ ] DNS: VPN off/on, partial observations, blocked service and recovery.
- [ ] WebRTC: VPN off/on, blocked STUN, missing IPv4 or IPv6 baseline, repeated run.
- [ ] IPv4/IPv6: IPv4-only, IPv6-only/dual-stack, one endpoint unavailable and both unavailable.
- [ ] Website Reachability: HTTPS, HTTP, redirect, timeout, invalid URL, permission granted and denied.
- [ ] Verify last results restore after closing and reopening the popup.
- [ ] Run different diagnostics close together and verify no history entries are lost.
- [ ] Verify Timeline filters, date grouping, comparisons and clear-history behavior.
- [ ] Verify Security Overview refreshes after each diagnostic and never calls partial data a complete result.
- [ ] Verify JSON export and clipboard copy; inspect the report for sensitive data.
- [ ] Verify profile save/compare and local persistence.
- [ ] Verify persistent update and uninstall/reinstall lifecycle with the same extension ID.

## Privacy and packaging

- [ ] Review all manifest permissions and optional website-origin prompts.
- [ ] Confirm no telemetry, remote code, automatic report upload or unexpected network endpoint was added.
- [ ] Confirm README's service list and privacy explanation match actual code.
- [ ] Inspect the exported JSON and remove any data before sharing.
- [ ] Prepare final ZIP/XPI and verify the archive contains only required extension files.
- [ ] Prepare release notes and publish the stable 1.0.0 tag only after manual verification.

## Release evidence

Record Firefox version, OS, VPN client/version, test network, exact commit SHA, automated run URL and manual test results. Never include public IPs or DNS resolver addresses in public test evidence.

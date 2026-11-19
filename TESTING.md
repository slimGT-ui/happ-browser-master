# HAPP Browser — QA regression test log

This document tracks manual regression testing for HAPP Browser. Results reflect the user's completed manual test run.

## Test environment

Record before additional testing:
- Date and time:
- OS:
- Firefox version:
- HAPP Browser commit:
- VPN client and version:
- VPN exit country / expected DNS provider:
- Firefox network/proxy settings changed from default:

Use the same device and network for paired VPN-off / VPN-on comparisons. Do not publish public IP addresses, DNS resolver addresses, or screenshots containing them.

## Test matrix

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-01 | Normal IP lookup | Run Public IP check with working internet | A valid IP and country are shown; result is not presented as proof of leak-free traffic |
| IP-02 | IP service unavailable | Block ipwho.is or disconnect network, then run check | Clear error state; no stale value is presented as a fresh result |
| DNS-01 | DNS with VPN off | Run DNS test and record resolver IP/ASN | Observed resolvers are shown when available; no automatic leak verdict |
| DNS-02 | DNS with VPN on | Repeat on the same network with VPN enabled | Results can be compared with the expected VPN DNS provider; differences are not automatically called leaks |
| DNS-03 | DNS service unavailable | Block dnsleak.dev, then run test | Clear error or insufficient-data message; popup remains usable |
| DNS-04 | Partial DNS observations | Allow test creation but prevent some probe requests | Partial/insufficient data is reported honestly; no false success |
| RTC-01 | WebRTC with VPN off | Run WebRTC test and record baseline and public ICE candidates | Candidates and comparisons are displayed; verdict follows the documented rules |
| RTC-02 | WebRTC with VPN on | Repeat with VPN enabled | A mismatch is flagged as possible exposure; no mismatch is not described as an absolute guarantee |
| RTC-03 | STUN blocked | Block stun.l.google.com:19302, then run test | Timeout/error or inconclusive result; never a safe/no-leak verdict solely because no candidates arrived |
| RTC-04 | One address family unavailable | Make IPv4 or IPv6 control endpoint unavailable | Candidates of the unavailable family remain un-compared; verdict is inconclusive unless a mismatch is independently found |
| V6-01 | IPv4-only network | Run IPv6 check | IPv4 availability is shown; IPv6 endpoint failure is described as unavailable/undetermined |
| V6-02 | Dual-stack network | Run IPv6 check | IPv4 and IPv6 results are shown separately; availability is not treated as proof of VPN routing |
| SITE-01 | Reachable HTTPS site | Check a known reachable HTTPS domain and grant permission | Network response is reported; no HTTP status/body claim is made |
| SITE-02 | Permission denied | Deny the requested host permission | Check stops with a clear permission message |
| SITE-03 | Unreachable site / timeout | Check a deliberately unavailable host | Failure or timeout is shown and recorded |
| SITE-04 | Invalid URL | Try empty input, malformed URL, credentials in URL, and non-HTTP scheme | Input is rejected with a useful message |
| ROUTE-01 | Normal destination | Enter a reachable HTTPS domain and run Network Path Diagnostics | DNS addresses and available TRR metadata are shown; target and both controls are probed; result is stored |
| ROUTE-02 | DNS API unavailable / proxy DNS | Run with DNS API unavailable or SOCKS proxy DNS routing enabled | DNS is marked unavailable without inventing addresses; HTTP probes still run and the limitation is explained |
| ROUTE-03 | Direct IP destination | Enter a valid IPv4 or IPv6 URL | DNS is marked not applicable; the address is not sent to the DNS resolver |
| ROUTE-04 | Destination-only failure | Block the chosen destination while at least one control endpoint remains reachable | Result is classified as destination-specific / policy-related, not as a proven routing fault |
| ROUTE-05 | All endpoints unavailable | Disconnect the network or block destination and both controls | Broad endpoint failure is shown as a possible connectivity issue, not packet loss or a VPN-off verdict |
| ROUTE-06 | Permission denied | Deny the requested destination origin permission | Diagnostic stops with a clear permission message; no target request is made |
| ROUTE-07 | Sensitive URL data | Enter a URL with query parameters and a fragment | Query and fragment are stripped before probing, displaying and storing the destination |
| ROUTE-08 | Timeline and report | Complete a route diagnostic, reopen popup, inspect Timeline, Security Overview, profile comparison and JSON export | Route event persists and is represented consistently in all integrations |
| PRV-01 | Normal privacy audit | Run Privacy & Permissions Audit after accepting the updated extension permissions | Own API permissions/origins and available Firefox settings are displayed with current values and control level |
| PRV-02 | Installed extension inventory | Install/enable several extensions with different permissions and run audit | Other extensions are listed; own HAPP Browser entry is excluded; names, enabled state, API and host permissions are shown when Firefox supplies them |
| PRV-03 | Broad / powerful extension permissions | Include an extension with broad host access or powerful API permissions | Broad host patterns and selected powerful permissions are highlighted for manual review, never labelled malware automatically |
| PRV-04 | Setting controlled by another extension | Use an extension that controls a supported privacy setting, then run audit | levelOfControl is shown and the setting is marked for review without naming or accusing an extension that cannot be identified |
| PRV-05 | Unsupported privacy setting | Test a Firefox build where one of the listed BrowserSetting properties is unavailable | Unsupported setting is distinguished from a read error; other settings still appear |
| PRV-06 | DNS over HTTPS limitation | Compare the audit with Firefox Settings > Privacy & Security > DNS over HTTPS | Audit explicitly says active DoH mode/provider/fallback are not exposed; it does not infer global DoH state from one isTRR result |
| PRV-07 | Management API failure | Simulate management.getAll rejection or an unavailable API | Browser setting audit still completes; extension inventory reports its own error and does not erase settings |
| PRV-08 | Persistence and integrations | Complete audit, reopen popup, inspect Timeline, Security Overview and JSON report | Latest audit restores as historical, event is in Timeline, Security Overview uses the latest result, JSON contains the audit |
| PRV-09 | Read-only behavior | Record privacy settings and extension enabled states, run audit, check them again | No browser setting changes; no extension is enabled, disabled or uninstalled |
| PRV-10 | Permission increase update | Update an existing signed installation to the build containing privacy and management permissions | Firefox displays the new permission request; after accepting, prior local diagnostic data remains available |


| HIST-01 | History persistence | Run several check types, close and reopen popup | Entries remain in local Firefox storage and show the correct type/status |
| HIST-02 | History limit | Generate more than 50 results | Only the newest 50 entries remain |
| HIST-03 | Clear history | Clear history and reopen popup | History is empty; clearing does not crash the popup |
| UI-01 | Repeated runs | Run each check several times in succession | Buttons recover after completion; no permanently disabled controls or duplicate result blocks |
| UI-02 | Simultaneous checks | Start different checks in succession | Each check reports its own result; popup remains responsive |
| PERM-01 | Fresh installation | Install temporary extension in a clean Firefox profile | Declared permissions include privacy and management for the audit; website permission is requested per origin. Review the Firefox permission prompt carefully |
| ERR-01 | Failed rerun replaces stale result | Complete IP, DNS and WebRTC checks successfully; make the network unavailable and rerun them; open Security Overview; restore network and rerun | Latest failed checks show errors instead of previous successful results; fresh successful results return after connectivity is restored |

## Automated regression tests

Run from the repository root with Node.js 20 (the version used by GitHub Actions):

```bash
node --test
```

Current automated suite before Connection Quality Monitor: 30 tests, including timeline sorting, filtering, summaries, status interpretation, descriptions, date grouping, change detection, previous-event lookup, popup wiring, WebRTC validator references, serialized history, release metadata and storage-failure handling. It covers valid and invalid IPv4/IPv6 (including full, compressed and IPv4-mapped forms), malformed IPv6 group counts/compression, the combined IP validator, manifest structure, popup asset references and version consistency. The Connection Quality Monitor adds five unit tests for latency statistics and result classification. GitHub Actions also runs JavaScript syntax checks for popup.js, advanced.js, ip-validation.js, ip-classification.js, timeline.js and quality-monitor.js. These checks do not replace the manual browser/network scenarios below.

Latest verified automated run: **30 passed, 0 failed** (commit 2978253; [GitHub Actions run 43510101050](https://github.com/slimGT-ui/happ-browser-master/actions/runs/43510101050)). Previous manual matrix: **23 passed, 0 failed, 0 deferred** (user-confirmed before the latest pre-release hardening). The additional 0.10.0 changes below require a focused manual retest before release.

## Result log

Allowed statuses: **PASS**, **FAIL**, **BLOCKED**, **DEFERRED**. Deferred cases have not been tested and must not be counted as passed.

| ID | Result | Notes |
|---|---|---|
| IP-01 | PASS | User confirmed normal public IP lookup works |
| IP-02 | PASS | User confirmed unavailable-IP-service behavior matches expected error handling |
| DNS-01 | PASS | User confirmed DNS test with VPN disabled works |
| DNS-02 | PASS | User confirmed DNS test with VPN enabled works |
| DNS-03 | PASS | User confirmed the DNS test handles an unavailable DNS service as expected |
| DNS-04 | PASS | User confirmed all remaining manual scenarios passed |
| RTC-01 | PASS | User confirmed all remaining manual scenarios passed |
| RTC-02 | PASS | User confirmed all remaining manual scenarios passed |
| RTC-03 | PASS | User confirmed all remaining manual scenarios passed |
| RTC-04 | PASS | User confirmed all remaining manual scenarios passed |
| V6-01 | PASS | User confirmed all remaining manual scenarios passed |
| V6-02 | PASS | User confirmed all remaining manual scenarios passed |
| SITE-01 | PASS | User confirmed all remaining manual scenarios passed |
| SITE-02 | PASS | User confirmed all remaining manual scenarios passed |
| SITE-03 | PASS | User confirmed all remaining manual scenarios passed |
| SITE-04 | PASS | User confirmed all remaining manual scenarios passed |
| HIST-01 | PASS | User confirmed all remaining manual scenarios passed |
| HIST-02 | PASS | User confirmed all remaining manual scenarios passed |
| HIST-03 | PASS | User confirmed all remaining manual scenarios passed |
| UI-01 | PASS | User confirmed all remaining manual scenarios passed |
| UI-02 | PASS | User confirmed all remaining manual scenarios passed |
| PERM-01 | PASS | User confirmed all remaining manual scenarios passed |
| ERR-01 | PASS | User confirmed failed IP, DNS and WebRTC reruns replace stale successful states; successful results return after connectivity is restored |

## Extension lifecycle checks — RC1 gate

These checks require a persistent, Mozilla-signed installation. A temporary add-on loaded through `about:debugging` is removed when Firefox restarts and is not sufficient to verify a normal installed-update lifecycle. Follow [RELEASE_CANDIDATE.md](RELEASE_CANDIDATE.md) to submit the 0.10.0 baseline and 0.10.1 RC1 as unlisted versions under the same add-on ID.

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| LIFE-01 | PASS | User confirmed persistent signed update preserves local data |
| LIFE-02 | PASS | User confirmed repeated update does not duplicate state |
| LIFE-03 | PASS | User confirmed uninstall/reinstall behavior is correct |
| LIFE-04 | PASS | User confirmed permission lifecycle behaves as expected |

All four lifecycle scenarios were manually tested by the user against the persistent signed installation and confirmed working.

## Focused retest for the 0.10.0 diagnostic code

The user confirmed all five focused scenarios below passed. RC1 changes release metadata and documentation only; no diagnostic behavior was intentionally changed:

| ID | Scenario | Expected result |
|---|---|---|
| RTC-05 | PASS | User confirmed public ICE candidate handling works; no reference error and correct address-family comparison |
| V6-03 | PASS | User confirmed partial/incomplete state is consistent across result, Timeline and Security Overview |
| HIST-04 | PASS | User confirmed concurrent diagnostic completions do not lose history events |
| TL-01 | PASS | User confirmed Timeline correctly describes changes against the previous event of the same type |
| RESTORE-01 | PASS | User confirmed saved diagnostic results are restored and labelled historical after reopening the popup |

## Current QA exit criteria

- Every applicable case has a recorded result.
- No critical or high-severity failure remains open.
- Error and inconclusive states are distinguishable from successful observations.
- VPN-on and VPN-off results have been compared on the same network.
- README limitations and actual behavior still match.
- Version is bumped only after the testing stage is complete and the release contents are frozen.

The earlier manual regression matrix was user-confirmed as 23 of 23 passed; all five focused 0.10.0 retest scenarios passed; and all four persistent-installation lifecycle scenarios (LIFE-01 through LIFE-04) were confirmed passed by the user. Functional and lifecycle QA gates are complete.


## Connection Quality Monitor — stage 1

Automated coverage:
- Median, average, minimum and maximum HTTPS probe latency.
- Jitter calculation from successive successful probes.
- Failed probe percentage and empty/all-failed sample handling.
- Complete, partial and failed run classification.

Manual scenarios required before release:

| ID | Scenario | Expected result |
|---|---|---|
| QUALITY-01 | Run all six probes on a normal connection | Latency metrics and six chart bars are shown; result is saved locally |
| QUALITY-02 | Repeat with VPN enabled on the same network | A second result is recorded; compare median latency and jitter without assuming the VPN must be faster |
| QUALITY-03 | Block one of the two HTTPS endpoints | Partial result is shown and failed probes are counted |
| QUALITY-04 | Block both endpoints or disconnect the network | No successful latency metrics; clear failed state, popup remains responsive |
| QUALITY-05 | Close and reopen the popup | Latest result is restored and the history entry remains in Diagnostic Timeline |
| QUALITY-06 | Clear diagnostic history | Quality history entry is removed with the rest of the timeline; latest result remains available until overwritten |


## DNS Resolver Intelligence — stage 2

Automated coverage is provided by tests/dns-intelligence.test.js.

| ID | Scenario | Expected result |
|---|---|---|
| DNSI-01 | Resolver metadata identifies Cloudflare, Google, Quad9 or OpenDNS | Provider is identified and its public DoH support is displayed |
| DNSI-02 | Resolver belongs to an unknown organization | Organization is shown as unknown; no provider or DoH capability is guessed |
| DNSI-03 | Resolver metadata is missing | Provider and DoH support remain explicitly unknown |
| DNSI-04 | Provider supports DoH | UI says the provider supports DoH, but does not claim Firefox currently uses it |
| DNSI-05 | DNS results are restored after reopening popup | Provider intelligence is recomputed from saved resolver metadata |
| DNSI-06 | DNS results appear in Timeline and Security Overview | Provider context is shown without turning resolver observations into an automatic leak verdict |


| DNSI-07 | Resolver country differs from a recent public-IP exit country | Show a manual-review hint; do not label it a leak |
| DNSI-08 | No recent public-IP country is available | Do not infer a geographic mismatch |
| DNSI-09 | Resolvers are observed in multiple countries | Report geographic diversity without treating it as proof of a leak |
| DNSI-10 | Resolver set is unchanged between successful tests | Show no change; duplicate observations and lookup ordering do not affect comparison |
| DNSI-11 | Resolver IP or ASN/provider metadata changes | Show added/removed/changed metadata and explain that VPN/DNS rotation may be normal |
| DNSI-12 | First successful test or failed/empty rerun | No baseline warning on the first test; failed/empty runs must not replace the last successful comparison baseline |


## DNS Resolver Intelligence manual QA confirmation — 2026-11-16

The user manually checked the Firefox scenarios and confirmed that all three pass:

| ID | Result | Notes |
|---|---|---|
| DNSI-10 | PASS | User confirmed repeated successful tests with an unchanged resolver set show no false change. |
| DNSI-11 | PASS | User confirmed changing the network / resolver environment displays the expected resolver changes. |
| DNSI-12 | PASS | User confirmed failed or empty reruns do not erase the previous successful comparison baseline. |

These are user-confirmed manual results. Automated CI passed on the implementation head. Stage 2 was accepted and merged into main through squash PR #6 on 2026-11-16 (merge commit 799d97b27d08c2dff949afdb2d19fff37b60fe11).


## Browser Fingerprint Check — stage 3

Planned manual scenarios (final IDs and expected results may be refined during implementation):

| ID | Scenario | Expected result |
|---|---|---|
| FINGERPRINT-01 | Run check on a normal HTTPS page | Page-visible UA, language, timezone, screen and supported capability data are displayed; no network request is made by the fingerprint module |
| FINGERPRINT-02 | Canvas readback is available | Canvas readback is classified as available; a local derived marker is shown and stored only in Firefox local storage, never uploaded |
| FINGERPRINT-03 | Canvas readback is blocked or throws | State is shown as blocked/inconclusive, not as a passed privacy test |
| FINGERPRINT-04 | WebGL is available with debug renderer info | WebGL capability and exposed renderer metadata are displayed with a privacy note |
| FINGERPRINT-05 | WebGL or debug renderer info is unavailable | Unsupported/blocked/unavailable is distinguished; no renderer is guessed |
| FINGERPRINT-06 | Run on a restricted browser page (about:, PDF viewer, extension page) | Clear unsupported-page error; popup remains responsive and previous result is not overwritten |
| FINGERPRINT-07 | Reopen popup after a successful run | Last result is restored as historical data and timeline entry remains |

Firefox-specific: navigator.userAgentData is not supported; report Client Hints as unavailable rather than fabricating values. Any score must describe observable surface only, not global fingerprint uniqueness or entropy.

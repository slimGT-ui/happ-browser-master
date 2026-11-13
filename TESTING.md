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
| HIST-01 | History persistence | Run several check types, close and reopen popup | Entries remain in local Firefox storage and show the correct type/status |
| HIST-02 | History limit | Generate more than 50 results | Only the newest 50 entries remain |
| HIST-03 | Clear history | Clear history and reopen popup | History is empty; clearing does not crash the popup |
| UI-01 | Repeated runs | Run each check several times in succession | Buttons recover after completion; no permanently disabled controls or duplicate result blocks |
| UI-02 | Simultaneous checks | Start different checks in succession | Each check reports its own result; popup remains responsive |
| PERM-01 | Fresh installation | Install temporary extension in a clean Firefox profile | Only declared permissions are requested initially; website permission is requested per origin |
| ERR-01 | Failed rerun replaces stale result | Complete IP, DNS and WebRTC checks successfully; make the network unavailable and rerun them; open Security Overview; restore network and rerun | Latest failed checks show errors instead of previous successful results; fresh successful results return after connectivity is restored |

## Automated regression tests

Run from the repository root with Node.js 20 (the version used by GitHub Actions):

```bash
node --test
```

Current automated suite: 30 tests, including timeline sorting, filtering, summaries, status interpretation, descriptions, date grouping, change detection, previous-event lookup, popup wiring, WebRTC validator references, serialized history, release metadata and storage-failure handling. It covers valid and invalid IPv4/IPv6 (including full, compressed and IPv4-mapped forms), malformed IPv6 group counts/compression, the combined IP validator, manifest structure, popup asset references and version consistency. GitHub Actions also runs JavaScript syntax checks for popup.js, advanced.js, ip-validation.js and ip-classification.js and timeline.js. These checks do not replace the manual browser/network scenarios below.

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

## Extension lifecycle checks

These checks require a persistent, signed installation or an appropriate Firefox test build. A temporary add-on loaded through `about:debugging` is removed when Firefox restarts and is not sufficient to verify a normal installed-update lifecycle.

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| LIFE-01 | Update preserves local data | Install a persistent build, run checks, save history and a VPN profile, then install a newer build with the same extension ID | History, latest results and saved profile remain available after the update |
| LIFE-02 | Update does not duplicate state | Repeat the update process across two consecutive versions and reopen the popup | No duplicate history entries or reset profile caused by startup/update handling |
| LIFE-03 | Uninstall behavior | Uninstall the extension through Firefox Add-ons Manager, then reinstall it | Firefox removes extension-owned local storage on uninstall; the reinstalled extension starts with empty extension data |
| LIFE-04 | Permission lifecycle | Update the extension and separately run Website Reachability for a new origin | Required permissions remain limited to declared permissions; optional site access is requested only when that origin is tested |

Do not mark these cases PASS based on a temporary add-on reload. Record the Firefox build, installation type and extension version used.

## ## Focused retest for the final 0.10.0 hardening

The following changes were added after the previous 23-case manual pass. Record each as PASS/FAIL/BLOCKED before a stable release:

| ID | Scenario | Expected result |
|---|---|---|
| RTC-05 | Public ICE candidates appear | No JavaScript reference error; correct IPv4/IPv6 family comparison |
| V6-03 | One address-family endpoint is unavailable | Partial/incomplete state is shown consistently in the result, Timeline and Security Overview |
| HIST-04 | Two or more diagnostics finish close together | No history event is lost |
| TL-01 | Same diagnostic run with changed values | Timeline describes changes against the previous event of the same type |
| RESTORE-01 | Close and reopen popup after running checks | Last saved result for every diagnostic is restored and labelled historical |

## Current QA exit criteria

- Every applicable case has a recorded result.
- No critical or high-severity failure remains open.
- Error and inconclusive states are distinguishable from successful observations.
- VPN-on and VPN-off results have been compared on the same network.
- README limitations and actual behavior still match.
- Version is bumped only after the testing stage is complete and the release contents are frozen.

The earlier manual regression matrix was user-confirmed as 23 of 23 passed. Do not treat the focused 0.10.0 retest above as passed until the user verifies this exact code.

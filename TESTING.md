# HAPP Browser — QA plan (0.6.0)

This document tracks manual regression testing for the 0.6.0 testing stage. **DEFERRED** means the case has not been executed and is not a pass. Revisit deferred cases before a stable release.

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

## Result log

Allowed statuses: **PASS**, **FAIL**, **BLOCKED**, **DEFERRED**. Deferred cases have not been tested and must not be counted as passed.

| ID | Result | Notes |
|---|---|---|
| IP-01 | PASS | User confirmed normal public IP lookup works |
| IP-02 | PASS | User confirmed unavailable-IP-service behavior matches expected error handling |
| DNS-01 | PASS | User confirmed DNS test with VPN disabled works |
| DNS-02 | PASS | User confirmed DNS test with VPN enabled works |
| DNS-03 | PASS | User confirmed the DNS test handles an unavailable DNS service as expected |
| DNS-04 | DEFERRED | User postponed remaining manual tests |
| RTC-01 | DEFERRED | User postponed remaining manual tests |
| RTC-02 | DEFERRED | User postponed remaining manual tests |
| RTC-03 | DEFERRED | User postponed remaining manual tests |
| RTC-04 | DEFERRED | User postponed remaining manual tests |
| V6-01 | DEFERRED | User postponed remaining manual tests |
| V6-02 | DEFERRED | User postponed remaining manual tests |
| SITE-01 | DEFERRED | User postponed remaining manual tests |
| SITE-02 | DEFERRED | User postponed remaining manual tests |
| SITE-03 | DEFERRED | User postponed remaining manual tests |
| SITE-04 | DEFERRED | User postponed remaining manual tests |
| HIST-01 | DEFERRED | User postponed remaining manual tests |
| HIST-02 | DEFERRED | User postponed remaining manual tests |
| HIST-03 | DEFERRED | User postponed remaining manual tests |
| UI-01 | DEFERRED | User postponed remaining manual tests |
| UI-02 | DEFERRED | User postponed remaining manual tests |
| PERM-01 | DEFERRED | User postponed remaining manual tests |

## Exit criteria for 0.6.0

- Every applicable case has a recorded result.
- No critical or high-severity failure remains open.
- Error and inconclusive states are distinguishable from successful observations.
- VPN-on and VPN-off results have been compared on the same network.
- README limitations and actual behavior still match.
- Version is bumped only after the testing stage is complete and the release contents are frozen.

The current manual test stage is **partially verified**: 5 of 22 cases passed; 17 are deferred.

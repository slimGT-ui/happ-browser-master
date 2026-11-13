# HAPP Browser 1.0.0 — Release Candidate 1

## Candidate build

- Product target: 1.0.0 Stable
- Candidate build version: 0.10.1
- Extension ID: `happ-browser@slimgt-ui`
- Target browser: Firefox
- Branch: `release/1.0.0-rc1`

The candidate build number is 0.10.1 so that the eventual 1.0.0 stable version is a newer Firefox extension version. The popup labels this build as an RC for 1.0.0.

## What is frozen for RC1

No new diagnostic features are planned for this candidate. The diagnostic implementation is the manually tested 0.10.0 code; the candidate changes release metadata and documentation only.

Permissions remain:
- `storage`
- `clipboardWrite`
- Required diagnostic host permissions for IP and DNS services
- Optional per-origin HTTP/HTTPS access for Website Reachability

## Build and validation

The GitHub Actions workflow validates the source with Node.js 20, runs the 30 automated tests, and creates a ZIP package artifact. The ZIP is an unsigned extension source package; it is not directly installable persistently in regular Firefox.

## Signed installation and lifecycle test

Use a separate Firefox test profile. Do not replace your daily installation during RC testing.

1. Download the current `main` branch ZIP (version 0.10.0) and submit it to [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/) as an **Unlisted** add-on. Keep the existing add-on ID `happ-browser@slimgt-ui`; download the signed XPI when Mozilla finishes signing.
2. Install that signed 0.10.0 XPI in the test profile. Run a few diagnostics, save history and a VPN comparison profile, and note that the data exists.
3. Submit the RC1 package ZIP (version 0.10.1) as an update to the same unlisted add-on. Do not create a second add-on record or change its ID.
4. Download and install the newly signed 0.10.1 XPI as an update. Confirm the history, last diagnostic results and saved VPN profile remain.
5. Repeat with the next signed update only if another candidate is produced; verify no duplicate history records appear.
6. Uninstall the extension through Firefox Add-ons Manager, reinstall the signed candidate, and confirm extension-owned local data starts empty.
7. Run Website Reachability against a new origin and confirm Firefox asks for that origin's optional permission only when the check is started.

Important:
- A temporary add-on loaded through `about:debugging` does not verify persistent update behavior.
- Do not publish the unlisted listing publicly. This is a signing/testing path only.
- Do not share screenshots or exported reports containing public IPs, DNS resolver IPs, ICE candidates, or private URLs.

## Stable 1.0.0 release gate

Release 1.0.0 only when:
- GitHub Actions validation succeeds for the candidate commit.
- Mozilla signs the unlisted candidate package.
- LIFE-01, LIFE-03 and LIFE-04 pass in a persistent Firefox installation.
- No critical/high-severity defect is found.
- README, manifest, popup version, package version and changelog are aligned for the final stable package.
- A final stable 1.0.0 package is built and signed separately.

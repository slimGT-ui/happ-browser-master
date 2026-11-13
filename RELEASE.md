# HAPP Browser 1.0.0 — Stable release

## Build

The stable extension version is **1.0.0**. The Firefox package is built by GitHub Actions after validation.

The ZIP contains only the runtime files required by the extension:
- `manifest.json`
- `popup.html`, `popup.css`
- `popup.js`, `advanced.js`
- `ip-validation.js`, `ip-classification.js`, `timeline.js`

Tests, repository documentation, workflows and development files are not included in the extension ZIP.

## Mozilla signing

The GitHub Actions ZIP is an unsigned extension package. To install it persistently in standard Firefox:

1. Open [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/).
2. Submit the ZIP as an **Unlisted** add-on, or upload it as an update to the existing Unlisted add-on.
3. Preserve the add-on ID `happ-browser@slimgt-ui`. Do not create a second listing for an update.
4. Download the signed XPI after Mozilla completes validation.
5. Keep the listing Unlisted; this does not publish the add-on in the public catalogue.

The existing persistent update, data-preservation, uninstall/reinstall and permission-lifecycle scenarios were manually verified during RC testing. The final 1.0.0 package still needs Mozilla signing before it can be installed persistently.

## QA evidence

- 23/23 core manual regression scenarios passed.
- 5/5 focused diagnostic regression scenarios passed.
- 4/4 persistent-installation lifecycle scenarios passed.
- 30 automated tests passed in the RC validation run.
- The final 1.0.0 branch reruns the complete automated suite and builds the release ZIP.

## Scope and limitations

HAPP Browser diagnoses the network behavior visible to Firefox. It does not create or control a VPN tunnel, control HAPP Desktop, or synchronize desktop profiles. DNS observations, WebRTC candidates and IPv6 availability require interpretation and are not a guarantee that a VPN is leak-free.

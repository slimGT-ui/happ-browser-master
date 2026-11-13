> **Historical checklist — not applicable to the current main branch or 0.10.0 diagnostic release.** This checklist only applies to the separate SOCKS5 proxy proof of concept. HAPP Browser 0.10.0 does not configure Firefox proxy settings or control HAPP Desktop.

# Windows + Firefox manual verification

This checklist is the remaining machine-specific part of the current proof of concept. Do not enable LAN sharing just to make the test pass.

## A. Inspect HAPP first

1. Open HAPP Desktop and note its version.
2. Find the SOCKS5/local proxy settings and record the actual host/address and port shown by the app.
3. Keep **Allow LAN Connections** disabled for this first test.
4. If HAPP only shows a LAN IP after enabling that option, stop and report that. Do not enable it yet.
5. Check whether HAPP can keep its proxy listener running without enabling system-wide/TUN routing. The product goal requires other Windows applications to remain on their direct route.

## B. Check whether the listener is loopback-only

Open PowerShell and replace PORT with the actual SOCKS5 port:

```powershell
Get-NetTCPConnection -State Listen -LocalPort PORT |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Interpretation:
- 127.0.0.1 or ::1: loopback listener; appropriate for this extension test.
- 0.0.0.0, ::, or a LAN address such as 192.168.x.x: listener may be reachable from other devices; do not use it until we assess exposure.

Then test that the loopback endpoint accepts TCP connections:

```powershell
Test-NetConnection 127.0.0.1 -Port PORT
```

A successful TCP test only proves that something is listening; it does not yet prove that SOCKS5 requests work.

## C. Verify proxy routing before relying on the extension

With HAPP connected in the intended mode, compare:

```powershell
curl.exe https://api.ipify.org
curl.exe --socks5-hostname 127.0.0.1:PORT https://api.ipify.org
```

The second command explicitly sends the request through SOCKS5 and resolves the target hostname through the proxy.

Expected result for the project:
- The SOCKS5 request returns the HAPP exit IP.
- The direct request returns the normal/direct IP.
- If both return the HAPP IP, HAPP is likely routing system traffic globally; the extension alone cannot make other Windows applications direct.
- If the SOCKS5 request fails, record the exact error and do not enable LAN sharing as a workaround.

## D. Test the Firefox extension

Only after A–C establish a safe loopback listener and the desired routing behavior:

1. Load the research/happ-local-proxy branch temporarily in Firefox using about:debugging#/runtime/this-firefox.
2. If Firefox blocks proxy changes, open about:addons → HAPP Browser → Permissions and allow access to private windows. Firefox requires this for proxy settings changes.
3. In the extension, enter 127.0.0.1 and the verified SOCKS5 port.
4. Click **Подключить Firefox**.
5. Check the public IP in Firefox. It should match the SOCKS5 test.
6. Check a separate Windows application or run the direct curl command again. It should remain on the direct route.
7. Click **Отключить прокси** and confirm Firefox's previous proxy settings are restored.

## Send back these results

- HAPP Desktop version.
- Whether the SOCKS5 address/port are shown while LAN sharing is disabled.
- The LocalAddress result from Get-NetTCPConnection.
- Whether each curl command succeeds and whether the two public IPs are same/different (do not send your public IP if you prefer; just say same/different).
- Whether Firefox enabled and disabled the proxy successfully.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("manifest is valid and references files that exist", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);

  const popup = manifest.action?.default_popup;
  assert.ok(popup, "manifest.action.default_popup must be defined");
  assert.ok(fs.existsSync(path.join(root, popup)), `Missing popup file: ${popup}`);

  const html = read(popup);
  const referencedFiles = [
    ...[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => match[1]),
    ...[...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css)["']/gi)].map(match => match[1])
  ];
  assert.ok(referencedFiles.length > 0, "popup must reference its scripts and stylesheet");

  for (const file of referencedFiles) {
    assert.ok(fs.existsSync(path.join(root, file)), `Popup references missing file: ${file}`);
  }
});

test("application version is consistent across release metadata", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const popup = read("popup.html");
  const readme = read("README.md");
  const advanced = read("advanced.js");
  const packageJson = JSON.parse(read("package.json"));
  const version = manifest.version;
  assert.equal(packageJson.version, version, "package.json version must match manifest.json");

  assert.match(popup, new RegExp(`<span class="version">${version.replace(/\\./g, "\\\\.")}\\s*·\\s*STABLE</span>`),
    "popup stable label must match manifest.json");
  assert.ok(readme.includes(`Текущая версия — ${version} Stable`),
    "README stable version must match manifest.json");
  assert.match(advanced, new RegExp(`version: "${version}"`),
    "diagnostic report version must match manifest.json");
});

test("IPv4/IPv6 reachability checks use strict address validation", () => {
  const advanced = read("advanced.js");
  assert.match(advanced, /HappValidation\.validIPv4\(v4Result\)/,
    "IPv4 endpoint response must be validated as an actual IPv4 address");
  assert.match(advanced, /HappValidation\.validIPv6\(v6Result\)/,
    "IPv6 endpoint response must be validated as an actual IPv6 address");
});

test("manifest keeps arbitrary website access optional", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const requiredHosts = manifest.host_permissions || [];
  const optionalHosts = manifest.optional_host_permissions || [];

  assert.ok(requiredHosts.length > 0, "diagnostic service hosts must be declared");
  assert.deepEqual(requiredHosts.slice().sort(), [
    "https://*.t.dnsleak.dev/*",
    "https://api4.ipify.org/*",
    "https://api6.ipify.org/*",
    "https://dnsleak.dev/*",
    "https://ipwho.is/*",
    "https://www.cloudflare.com/*",
    "https://www.google.com/*"
  ].sort(), "required access must stay limited to diagnostic services");
  assert.deepEqual(optionalHosts.slice().sort(), ["http://*/*", "https://*/*"]);
  assert.equal(manifest.browser_specific_settings?.gecko?.id, "happ-browser@slimgt-ui",
    "extension ID must remain stable across updates");
});

test("WebRTC comparisons use the shared IP validators", () => {
  const popup = read("popup.js");
  assert.match(popup, /validIPv4\(item\.address\)/);
  assert.match(popup, /validIPv6\(item\.address\)/);
  assert.doesNotMatch(popup, /\bisIPv4\s*\(/);
  assert.doesNotMatch(popup, /\bisIPv6\s*\(/);
});

test("popup IDs are unique and every interactive script loads after its dependencies", () => {
  const html = read("popup.html");
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate element IDs break querySelector wiring");
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => match[1]);
  assert.ok(scripts.indexOf("ip-validation.js") < scripts.indexOf("popup.js"));
  assert.ok(scripts.indexOf("ip-classification.js") < scripts.indexOf("popup.js"));
  assert.ok(scripts.indexOf("dns-intelligence.js") < scripts.indexOf("popup.js"));
  assert.ok(scripts.indexOf("timeline.js") < scripts.indexOf("advanced.js"));
  assert.ok(scripts.indexOf("advanced.js") < scripts.indexOf("quality-monitor.js"));
  assert.ok(scripts.indexOf("advanced.js") < scripts.indexOf("privacy-audit.js"));
});

test("history writes are serialized and the security overview refreshes after results", () => {
  const advanced = read("advanced.js");
  assert.match(advanced, /let historyWriteQueue = Promise\.resolve\(\)/);
  assert.match(advanced, /historyWriteQueue\.then\(async \(\) =>/);
  assert.match(advanced, /await refreshSecuritySummary\(\)/);
});

test("last IP result is restored as historical data, not presented as a live check", () => {
  const popup = read("popup.js");
  assert.match(popup, /async function restoreIpCheck\(\)/);
  assert.match(popup, /актуальных данных/);
});

test("release docs describe the stable release and remaining publication gates", () => {
  const changelog = read("CHANGELOG.md");
  const checklist = read("RELEASE_CHECKLIST.md");
  assert.match(changelog, /\[0\.10\.0\]/);
  assert.match(checklist, /Do not create.*1\.0\.0/is);
  assert.match(checklist, /HAPP Desktop profile enumeration/is);
});

test("diagnostic persistence failures do not turn successful network checks into errors", () => {
  const popup = read("popup.js");
  assert.match(popup, /async function saveLocalResult\(key, value\)/);
  assert.match(popup, /await saveLocalResult\("lastIpCheck"/);
  assert.match(popup, /await saveLocalResult\("lastDnsCheck"/);
  assert.match(popup, /await saveLocalResult\("lastWebRtcCheck"/);
});

test("DNS baseline is preserved before any rerun replaces the latest successful snapshot", () => {
  const popup = read("popup.js");
  const preservation = popup.indexOf('await saveLocalResult("previousDnsCheck", lastDnsCheck)');
  const replacement = popup.indexOf('await saveLocalResult("lastDnsCheck", testResult)');
  assert.ok(preservation >= 0, "previous successful DNS result must be preserved");
  assert.ok(replacement > preservation, "baseline must be saved before replacing the latest DNS result");
  assert.match(popup, /if \(baselinePreserved\) \{\s+await saveLocalResult\("lastDnsCheck", testResult\)/,
    "a failed baseline write must prevent overwriting the only successful snapshot");
  assert.match(popup, /if \(baselinePreserved\) \{\s+await browser\.storage\.local\.set\(\{\s+lastDnsCheck: \{ verdict: "error"/,
    "a failed baseline write must also prevent an error result from overwriting the successful snapshot");
  assert.match(popup, /const storedDnsState = await browser\.storage\.local\.get\("lastDnsCheck"\)\.catch\(storageError => \{/,
    "a failed storage read must be distinguishable from an empty DNS state");
  assert.match(popup, /if \(storedDnsState === null\) \{[\s\S]*?return;\s+\}/,
    "a failed storage read must stop the error handler before it can overwrite the baseline");
});


test("fingerprint diagnostics use temporary active-tab access without broad host permissions", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(!manifest.permissions.includes("<all_urls>"));
  assert.ok(!manifest.host_permissions.includes("<all_urls>"));
  const html = read("popup.html");
  assert.match(html, /id="run-fingerprint-check"/);
  assert.match(html, /fingerprint\.js/);
  assert.ok(fs.existsSync(path.join(root, "fingerprint.js")));
  assert.ok(html.includes('id="run-route-check"'));
  assert.ok(html.includes("route-diagnostics.js"));
  assert.ok(JSON.parse(read("manifest.json")).permissions.includes("dns"));
  assert.ok(JSON.parse(read("manifest.json")).permissions.includes("privacy"));
  assert.ok(html.includes('id="run-privacy-audit"'));
  assert.ok(html.includes("privacy-audit.js"));
  assert.ok(fs.existsSync(path.join(root, "privacy-audit.js")));
});


test("fingerprint diagnostics are integrated with history, security overview and report export", () => {
  const timeline = read("timeline.js");
  const advanced = read("advanced.js");
  const html = read("popup.html");
  assert.match(timeline, /Fingerprint: "Browser Fingerprint"/);
  assert.match(timeline, /current\.type === "Fingerprint"/);
  assert.match(advanced, /lastFingerprintCheck/);
  assert.match(advanced, /stored\.lastFingerprintCheck \|\| latest\("Fingerprint"\)/);
  assert.match(advanced, /securityRow\("Browser Fingerprint"/);
  assert.match(advanced, /fingerprint: stored\.lastFingerprintCheck/);
  assert.ok(html.indexOf('src="advanced.js"') < html.indexOf('src="fingerprint.js"'),
    "fingerprint UI must load after the history/security module");
});


test("fingerprint measurements render even if local persistence fails", () => {
  const source = read("fingerprint.js");
  assert.ok(source.indexOf("render(record)") < source.indexOf("storage.local.set({ lastFingerprintCheck: record })"),
    "successful measurements must be rendered before attempting storage");
  assert.match(source, /Предыдущий сохранённый результат не изменён/);
  assert.match(source, /data: record\.data/);
});


test("stable package workflow includes every runtime module referenced by popup", () => {
  const workflow = read(".github/workflows/release-candidate.yml");
  const html = read("popup.html");
  const referenced = [
    ...[...html.matchAll(/<script\\b[^>]*\\bsrc=["']([^"']+)["']/gi)].map(match => match[1]),
    ...[...html.matchAll(/<link\\b[^>]*\\bhref=["']([^"']+\\.css)["']/gi)].map(match => match[1])
  ];
  for (const file of referenced) {
    assert.ok(workflow.includes(file), `Stable package must include popup asset: ${file}`);
  }
});


test("privacy audit declares required read-only Firefox settings and extension inventory APIs", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const source = read("privacy-audit.js");
  assert.ok(manifest.permissions.includes("privacy"), "Firefox privacy settings API requires the privacy permission");
  assert.ok(!manifest.optional_permissions?.includes("privacy"), "Firefox does not allow requesting privacy as an optional permission");
  assert.ok(manifest.permissions.includes("management"), "Firefox extension inventory requires the management API permission");
  assert.match(source, /browser\.permissions\.getAll/);
  assert.ok(source.includes("browserApi?.privacy?.network"));
  assert.match(source, /api\.init\(root\)/, "privacy audit must initialize its popup controls");
  assert.match(source, /refresh-security.*click/, "restored audit must refresh Security Overview");
  assert.doesNotMatch(source, /browser\.management/);
  assert.doesNotMatch(source, /setting\.set\s*\(/, "audit must not modify browser privacy settings");
});


test("privacy audit is persisted and included in security overview and JSON export", () => {
  const advanced = read("advanced.js");
  const timeline = read("timeline.js");
  assert.match(advanced, /"lastPrivacyAudit"/);
  assert.match(advanced, /privacyAudit: stored\.lastPrivacyAudit/);
  assert.match(advanced, /securityRow\("Privacy & Permissions Audit"/);
  assert.match(timeline, /Privacy: "Privacy & Permissions Audit"/);
  assert.match(timeline, /current\.type === "Privacy"/);
});

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

  assert.match(popup, new RegExp(`<span class="version">${version.replace(/\\./g, "\\\\.")}\\s*·\\s*PREVIEW</span>`),
    "popup version label must match manifest.json");
  assert.match(readme, new RegExp(`Текущая версия — ${version.replace(/\\./g, "\\\\.")} Preview`),
    "README current version must match manifest.json");
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
    "https://ipwho.is/*"
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
  assert.ok(scripts.indexOf("timeline.js") < scripts.indexOf("advanced.js"));
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
  assert.match(popup, /Последний сохранённый результат/);
});

test("release docs describe the current preview and stable-release gates", () => {
  const changelog = read("CHANGELOG.md");
  const checklist = read("RELEASE_CHECKLIST.md");
  assert.match(changelog, /\[0\.10\.0\]/);
  assert.match(checklist, /не создавать.*1\.0\.0/is);
  assert.match(checklist, /HAPP Desktop profile enumeration/is);
});

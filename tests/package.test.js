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
  const version = manifest.version;

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

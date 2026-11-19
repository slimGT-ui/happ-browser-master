const test = require("node:test");
const assert = require("node:assert/strict");
const audit = require("../privacy-audit.js");

const manifest = {
  permissions: ["storage", "privacy", "activeTab"],
  optional_permissions: ["tabs"],
  host_permissions: ["https://api.example.test/*"],
  optional_host_permissions: ["https://*/*"]
};

test("permission inventory distinguishes required, optional, granted and missing permissions", () => {
  const result = audit.analyzePermissions(manifest, {
    permissions: ["storage", "privacy", "tabs"],
    origins: ["https://api.example.test/*", "https://one.example/*"]
  });
  assert.equal(result.summary.declaredApi, 4);
  assert.equal(result.summary.grantedApi, 3);
  assert.deepEqual(result.summary.missingRequiredApi, ["activeTab"]);
  assert.equal(result.requiredHosts.length, 1);
  assert.equal(result.optionalHosts.length, 1);
  assert.equal(result.grantedOrigins.length, 2);
});

test("permission inventory safely ignores malformed permission data", () => {
  const result = audit.analyzePermissions({}, { permissions: ["storage", 4, null], origins: "all" });
  assert.deepEqual(result.apiPermissions, []);
  assert.deepEqual(result.grantedOrigins, []);
  assert.equal(result.summary.grantedApi, 0);
});

test("WebRTC settings are interpreted without claiming leak-free traffic", () => {
  const definition = audit.SETTING_DEFINITIONS.find(item => item.key === "webRTCIPHandlingPolicy");
  const relaxed = audit.normalizeSetting(definition, { value: "default", levelOfControl: "controllable_by_this_extension" });
  const strict = audit.normalizeSetting(definition, { value: "proxy_only", levelOfControl: "controllable_by_this_extension" });
  assert.equal(relaxed.recommendation, "review");
  assert.match(relaxed.detail, /проверь результат WebRTC-теста/);
  assert.equal(strict.recommendation, "info");
  assert.match(strict.detail, /не гарантирует отсутствие утечек/);
});

test("network prediction and HTTPS-only values produce review guidance", () => {
  const prediction = audit.normalizeSetting(
    audit.SETTING_DEFINITIONS.find(item => item.key === "networkPredictionEnabled"),
    { value: true }
  );
  const https = audit.normalizeSetting(
    audit.SETTING_DEFINITIONS.find(item => item.key === "httpsOnlyMode"),
    { value: "never" }
  );
  assert.equal(prediction.recommendation, "review");
  assert.equal(https.recommendation, "review");
});

test("GPC is informational and does not become an automatic security verdict", () => {
  const setting = audit.normalizeSetting(
    audit.SETTING_DEFINITIONS.find(item => item.key === "globalPrivacyControl"),
    { value: false }
  );
  assert.equal(setting.recommendation, "info");
  assert.match(setting.detail, /не отправляется/);
});

test("settings controlled by another extension are flagged for review", () => {
  const setting = audit.normalizeSetting(
    audit.SETTING_DEFINITIONS.find(item => item.key === "httpsOnlyMode"),
    { value: "always", levelOfControl: "controlled_by_other_extensions" }
  );
  assert.equal(setting.recommendation, "review");
  assert.match(setting.detail, /контролируется другим расширением/);
});

test("unsupported settings and API failures remain distinguishable", () => {
  const definition = audit.SETTING_DEFINITIONS[0];
  assert.equal(audit.normalizeSetting(definition, {}).status, "unsupported");
  assert.equal(audit.normalizeSetting(definition, null, new Error("denied")).status, "error");
});

test("audit summary distinguishes missing, partial, clean and review states", () => {
  assert.equal(audit.summarizeRecord(null).status, "missing");
  assert.equal(audit.summarizeRecord({ status: "partial" }).status, "incomplete");
  assert.equal(audit.summarizeRecord({ status: "observed", summary: { reviewCount: 0, availableSettings: 5, totalSettings: 5 } }).status, "pass");
  assert.equal(audit.summarizeRecord({ status: "observed", summary: { reviewCount: 2, availableSettings: 5, totalSettings: 5 } }).status, "review");
});

test("audit records explicitly document unavailable DoH and other-extension inventory", () => {
  const record = audit.createAuditRecord(manifest, { permissions: ["privacy"], origins: [] }, {
    peerConnectionEnabled: { value: { value: true } }
  }, "2026-11-19T10:00:00.000Z");
  assert.equal(record.status, "observed");
  assert.match(record.limitations.dnsOverHttps, /не раскрывает текущий режим/);
  assert.match(record.limitations.otherExtensions, /management\.getAll/);
  assert.equal(record.settings.length, 5);
});

test("privacy audit module only reads BrowserSetting values and never changes them", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../privacy-audit.js"), "utf8");
  assert.match(source, /setting\.get\(\{\}\)/);
  assert.doesNotMatch(source, /setting\.set\s*\(/);
  assert.doesNotMatch(source, /management\.(setEnabled|uninstall|uninstallSelf)\s*\(/);
  assert.ok(source.includes("browserApi?.management?.getAll"));
});


test("extension inventory filters the current add-on and identifies broad access", () => {
  const items = audit.sanitizeExtensions([
    { id: "self", type: "extension", name: "HAPP Browser", permissions: ["storage"] },
    { id: "addon-1", type: "extension", name: "Example", enabled: true, version: "2.0",
      permissions: ["proxy", "storage"], hostPermissions: ["https://*/*"] },
    { id: "theme-1", type: "theme", name: "Theme" }
  ], "self");
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Example");
  assert.deepEqual(items[0].powerfulPermissions, ["proxy"]);
  assert.equal(items[0].broadHostAccess, true);
});

test("extension inventory is bounded and ignores malformed entries", () => {
  const items = audit.sanitizeExtensions([
    null,
    { type: "extension", id: "one", name: "One", permissions: ["storage"] },
    ...Array.from({ length: 120 }, (_, index) => ({ type: "extension", id: "id-" + index, name: "Addon " + index }))
  ]);
  assert.equal(items.length, 100);
  assert.equal(items[0].name, "One");
});

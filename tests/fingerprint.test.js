const test = require("node:test");
const assert = require("node:assert/strict");
const fingerprint = require("../fingerprint.js");

test("fingerprint summary counts only observed attributes", () => {
  const summary = fingerprint.summarize({
    userAgent: "Firefox",
    platform: "Win32",
    language: "ru-RU",
    timezone: "Europe/Stockholm",
    canvas: { status: "available", hash: "abc" },
    webgl: { status: "blocked" }
  });
  assert.equal(summary.observable, 5);
  assert.equal(summary.total, fingerprint.FIELDS.length);
  assert.match(summary.label, /5 из 11/);
});

test("blocked and unavailable graphics APIs are not counted as exposed", () => {
  const summary = fingerprint.summarize({
    userAgent: "Firefox",
    canvas: { status: "blocked" },
    webgl: { status: "unavailable" }
  });
  assert.equal(summary.observable, 1);
});

test("normalization rejects invalid data and preserves execution context", () => {
  assert.throws(() => fingerprint.normalize(null), /Некорректный результат/);
  const record = fingerprint.normalize({ userAgent: "Firefox" }, "isolated");
  assert.equal(record.status, "observed");
  assert.equal(record.executionContext, "isolated");
  assert.equal(record.summary.observable, 1);
});

test("fingerprint module does not include remote collection endpoints", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../fingerprint.js"), "utf8");
  assert.doesNotMatch(source, /https?:\/\//);
});


test("normalization bounds page-controlled strings and rejects malformed graphics metadata", () => {
  const record = fingerprint.normalize({
    userAgent: "A".repeat(2000),
    languages: ["B".repeat(200), 7],
    screen: { width: 1920, height: 1080 },
    canvas: { status: "available", hash: "not-a-valid-hash" },
    webgl: { status: "available", vendor: "V".repeat(500), renderer: "R".repeat(500), debugInfo: "yes" }
  });
  assert.equal(record.data.userAgent.length, 512);
  assert.equal(record.data.languages[0].length, 64);
  assert.equal(record.data.canvas.hash, null);
  assert.equal(record.data.webgl.vendor.length, 160);
  assert.equal(record.data.webgl.renderer.length, 240);
  assert.equal(record.data.webgl.debugInfo, false);
  assert.equal(record.data.clientHints.status, "unsupported");
});

test("empty screen and language collections are not counted as observable", () => {
  const summary = fingerprint.summarize({
    screen: { width: null, height: null },
    languages: [],
    canvas: { status: "unavailable" },
    webgl: { status: "unavailable" }
  });
  assert.equal(summary.observable, 0);
});

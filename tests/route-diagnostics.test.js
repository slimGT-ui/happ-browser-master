const test = require("node:test");
const assert = require("node:assert/strict");
const route = require("../route-diagnostics.js");

test("route target normalization accepts HTTP(S), adds HTTPS and removes query secrets", () => {
  const target = route.normalizeTarget("example.com/path?token=secret#fragment");
  assert.equal(target.url.href, "https://example.com/path");
  assert.equal(target.host, "example.com");
  assert.equal(target.isIp, false);
  assert.equal(route.normalizeTarget("http://example.com").url.protocol, "http:");
  assert.equal(route.normalizeTarget("https://[2606:4700:4700::1111]/").isIp, true);
});

test("route target normalization rejects invalid schemes, credentials and malformed URLs", () => {
  assert.throws(() => route.normalizeTarget("ftp://example.com"), /HTTP и HTTPS/);
  assert.throws(() => route.normalizeTarget("https://user:pass@example.com"), /логином или паролем/);
  assert.throws(() => route.normalizeTarget("not a url"), /Некорректный URL/);
});

test("route DNS normalization validates, deduplicates and limits addresses", () => {
  const result = route.normalizeDnsRecord({
    addresses: ["1.1.1.1", "1.1.1.1", "not-an-ip", "2606:4700:4700::1111"],
    canonicalName: "edge.example.com",
    isTRR: true
  });
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.addresses, ["1.1.1.1", "2606:4700:4700::1111"]);
  assert.equal(result.canonicalName, "edge.example.com");
  assert.equal(result.isTRR, true);
  const many = Array.from({ length: 20 }, (_, index) => "192.0.2." + (index + 1));
  assert.equal(route.normalizeDnsRecord({ addresses: many }).addresses.length, 16);
});

test("route DNS normalization distinguishes direct IP targets and unavailable DNS", () => {
  assert.equal(route.normalizeDnsRecord(null, true).status, "not-applicable");
  assert.equal(route.normalizeDnsRecord({ addresses: [] }).status, "error");
});

test("route diagnosis distinguishes reachable target, target-specific issue and broad endpoint failure", () => {
  assert.deepEqual(route.classifyRoute(
    { status: "reachable", latencyMs: 120 },
    [{ status: "reachable" }, { status: "reachable" }]
  ), { status: "reachable", diagnosis: "destination-reachable" });
  assert.deepEqual(route.classifyRoute(
    { status: "unreachable" },
    [{ status: "reachable" }, { status: "unreachable" }]
  ), { status: "destination-issue", diagnosis: "destination-specific-or-policy" });
  assert.deepEqual(route.classifyRoute(
    { status: "unreachable" },
    [{ status: "unreachable" }, { status: "unreachable" }]
  ), { status: "network-issue", diagnosis: "multiple-endpoints-unreachable" });
  assert.deepEqual(route.classifyRoute(
    { status: "reachable" },
    [{ status: "unreachable" }, { status: "reachable" }]
  ), { status: "partial", diagnosis: "destination-reachable-controls-partial" });
});

test("route status maps diagnostic categories without claiming a VPN leak verdict", () => {
  assert.equal(route.getStatus({ status: "reachable" }), "success");
  assert.equal(route.getStatus({ status: "destination-issue" }), "review");
  assert.equal(route.getStatus({ status: "network-issue" }), "error");
  assert.equal(route.getStatus({ status: "inconclusive" }), "incomplete");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const dns = require("../dns-intelligence.js");

test("identifies common public DNS providers from resolver metadata", () => {
  const results = dns.analyzeResolvers([
    { ip: "1.1.1.1", asnName: "Cloudflare, Inc." },
    { ip: "8.8.8.8", network: "Google LLC" },
    { ip: "9.9.9.9", asnName: "Quad9" },
    { ip: "208.67.222.222", asnName: "Cisco OpenDNS" }
  ]);
  assert.deepEqual(results.map(item => item.provider), [
    "Cloudflare", "Google Public DNS", "Quad9", "Cisco OpenDNS"
  ]);
  assert.ok(results.every(item => item.dohSupport === "provider-supports-doh"));
});

test("identifies supported DNS providers from resolver IP addresses alone", () => {
  assert.equal(dns.analyzeResolver({ ip: "1.1.1.1" }).provider, "Cloudflare");
  assert.equal(dns.analyzeResolver({ ip: "8.8.8.8" }).provider, "Google Public DNS");
  assert.equal(dns.analyzeResolver({ ip: "9.9.9.9" }).provider, "Quad9");
});

test("does not infer a provider or DoH support from an unknown network", () => {
  const [result] = dns.analyzeResolvers([{ ip: "203.0.113.8", asnName: "Example Network" }]);
  assert.equal(result.provider, "Неизвестная организация");
  assert.equal(result.dohSupport, "unknown");
  assert.equal(result.dohEndpoint, null);
});

test("keeps missing resolver metadata explicitly unknown", () => {
  const [result] = dns.analyzeResolvers([{ ip: "203.0.113.9" }]);
  assert.equal(result.provider, "Не определён");
  assert.equal(result.providerType, "unknown");
});

test("summary reports DoH-capable providers without claiming DoH is active", () => {
  const summary = dns.summarize([
    { asnName: "Cloudflare" },
    { asnName: "Residential ISP" }
  ]);
  assert.equal(summary.count, 2);
  assert.equal(summary.dohCapable, 1);
  assert.equal(summary.dohStatus, "transport-unverified");
});

test("handles empty and malformed resolver collections", () => {
  assert.deepEqual(dns.analyzeResolvers(null), []);
  assert.equal(dns.summarize([]).dohStatus, "no-observations");
});

test("flags resolver country differences from a recent VPN exit country for review", () => {
  const result = dns.analyzeAnomalies([
    { ip: "203.0.113.10", countryCode: "DE", asnName: "Example ISP" },
    { ip: "203.0.113.11", countryCode: "NL", asnName: "Another ISP" }
  ], "DE");
  assert.equal(result.exitCountryMismatches.length, 1);
  assert.equal(result.exitCountryMismatches[0].ip, "203.0.113.11");
  assert.equal(result.hasGeographicDifferences, true);
});

test("does not claim a geographic anomaly when no exit country is available", () => {
  const result = dns.analyzeAnomalies([
    { ip: "203.0.113.10", countryCode: "DE" }
  ]);
  assert.equal(result.exitCountry, null);
  assert.deepEqual(result.exitCountryMismatches, []);
  assert.equal(result.hasGeographicDifferences, false);
});

test("reports multiple resolver countries without treating them as proof of a leak", () => {
  const result = dns.analyzeAnomalies([
    { ip: "203.0.113.10", countryCode: "DE" },
    { ip: "203.0.113.11", countryCode: "NL" }
  ]);
  assert.equal(result.multipleResolverCountries, true);
  assert.equal(result.exitCountryMismatches.length, 0);
});

test("resolver set comparison reports an unchanged baseline", () => {
  const resolvers = [{ ip: "1.1.1.1", asnName: "Cloudflare, Inc.", countryCode: "US" }];
  const result = dns.compareResolverSets(resolvers, resolvers);
  assert.equal(result.state, "same");
  assert.equal(result.changed, false);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.removed, []);
});

test("resolver set comparison detects added and removed addresses", () => {
  const result = dns.compareResolverSets(
    [{ ip: "1.1.1.1", asnName: "Cloudflare" }, { ip: "8.8.8.8", asnName: "Google" }],
    [{ ip: "1.1.1.1", asnName: "Cloudflare" }, { ip: "9.9.9.9", asnName: "Quad9" }]
  );
  assert.equal(result.state, "changed");
  assert.deepEqual(result.added.map(item => item.ip), ["9.9.9.9"]);
  assert.deepEqual(result.removed.map(item => item.ip), ["8.8.8.8"]);
});

test("resolver set comparison detects ASN, provider and country metadata changes", () => {
  const result = dns.compareResolverSets(
    [{ ip: "203.0.113.20", asn: "AS64500", asnName: "Example ISP", countryCode: "DE" }],
    [{ ip: "203.0.113.20", asn: "AS64501", asnName: "Quad9", countryCode: "NL" }]
  );
  assert.equal(result.state, "changed");
  assert.equal(result.metadataChanges.length, 1);
});

test("resolver set comparison detects organization and network name changes", () => {
  const previous = [{ ip: "203.0.113.30", asn: "AS64500", asnName: "Example ISP", network: "Example Network" }];
  const organizationChanged = dns.compareResolverSets(previous, [
    { ip: "203.0.113.30", asn: "AS64500", asnName: "Different ISP", network: "Example Network" }
  ]);
  assert.equal(organizationChanged.state, "changed");
  assert.equal(organizationChanged.metadataChanges.length, 1);

  const networkChanged = dns.compareResolverSets(previous, [
    { ip: "203.0.113.30", asn: "AS64500", asnName: "Example ISP", network: "Different Network" }
  ]);
  assert.equal(networkChanged.state, "changed");
  assert.equal(networkChanged.metadataChanges.length, 1);
});

test("resolver set comparison does not compare missing baselines or empty observations", () => {
  assert.equal(dns.compareResolverSets([], [{ ip: "1.1.1.1" }]).state, "unknown");
  assert.equal(dns.compareResolverSets([{ ip: "1.1.1.1" }], []).state, "unknown");
});

test("resolver set comparison deduplicates IPs and ignores lookup ordering", () => {
  const previous = [{ ip: "1.1.1.1" }, { ip: "8.8.8.8" }];
  const current = [{ ip: "8.8.8.8" }, { ip: "1.1.1.1" }, { ip: "1.1.1.1" }];
  assert.equal(dns.compareResolverSets(previous, current).state, "same");
});

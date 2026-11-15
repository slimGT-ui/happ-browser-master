(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HappDnsIntelligence = api;
})(globalThis, function () {
  "use strict";

  const PROVIDERS = [
    { name: "Cloudflare", pattern: /cloudflare|1\.1\.1\.1|one\.one\.one\.one/i, doh: "https://cloudflare-dns.com/dns-query" },
    { name: "Google Public DNS", pattern: /google|google llc|8\.8\.8\.8/i, doh: "https://dns.google/dns-query" },
    { name: "Quad9", pattern: /quad9|9\.9\.9\.9|pCH/i, doh: "https://dns.quad9.net/dns-query" },
    { name: "Cisco OpenDNS", pattern: /opendns|cisco umbrella|208\.67\.222\.222/i, doh: "https://doh.opendns.com/dns-query" },
    { name: "AdGuard DNS", pattern: /adguard/i, doh: "https://dns.adguard-dns.com/dns-query" },
    { name: "NextDNS", pattern: /nextdns/i, doh: "https://dns.nextdns.io/dns-query" },
    { name: "Control D", pattern: /control d|controld/i, doh: "https://freedns.controld.com/p0" },
    { name: "Mullvad DNS", pattern: /mullvad/i, doh: "https://dns.mullvad.net/dns-query" }
  ];

  function analyzeResolver(resolver) {
    const source = [resolver?.asnName, resolver?.network, resolver?.asn].filter(Boolean).join(" ");
    const provider = PROVIDERS.find(item => item.pattern.test(source)) || null;
    const hasOrganization = Boolean(resolver?.asnName || resolver?.network || resolver?.asn);
    return {
      ...resolver,
      provider: provider?.name || (hasOrganization ? "Неизвестная организация" : "Не определён"),
      providerType: provider ? "public-dns" : hasOrganization ? "identified-network" : "unknown",
      dohSupport: provider ? "provider-supports-doh" : "unknown",
      dohEndpoint: provider?.doh || null
    };
  }

  function analyzeResolvers(resolvers) {
    return (Array.isArray(resolvers) ? resolvers : []).map(analyzeResolver);
  }

  function summarize(resolvers) {
    const analyzed = analyzeResolvers(resolvers);
    const providers = [...new Set(analyzed.map(item => item.provider))];
    const dohCapable = analyzed.filter(item => item.dohSupport === "provider-supports-doh").length;
    return {
      count: analyzed.length,
      providers,
      dohCapable,
      dohStatus: analyzed.length
        ? "transport-unverified"
        : "no-observations"
    };
  }

  return Object.freeze({ analyzeResolver, analyzeResolvers, summarize });
});

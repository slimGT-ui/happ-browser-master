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


  function analyzeAnomalies(resolvers, exitCountryCode = "") {
    const analyzed = analyzeResolvers(resolvers);
    const exitCountry = typeof exitCountryCode === "string" ? exitCountryCode.trim().toUpperCase() : "";
    const countries = [...new Set(analyzed
      .map(item => typeof item.countryCode === "string" ? item.countryCode.trim().toUpperCase() : "")
      .filter(Boolean))];
    const mismatches = exitCountry
      ? analyzed.filter(item => {
          const country = typeof item.countryCode === "string" ? item.countryCode.trim().toUpperCase() : "";
          return country && country !== exitCountry;
        }).map(item => ({ ip: item.ip, resolverCountry: item.countryCode, exitCountry }))
      : [];
    return {
      exitCountry: exitCountry || null,
      resolverCountries: countries,
      multipleResolverCountries: countries.length > 1,
      exitCountryMismatches: mismatches,
      hasGeographicDifferences: mismatches.length > 0 || countries.length > 1
    };
  }

  function compareResolverSets(previousResolvers, currentResolvers) {
    const normalize = resolvers => {
      const entries = (Array.isArray(resolvers) ? resolvers : [])
        .filter(item => item && typeof item.ip === "string" && item.ip.trim())
        .map(item => {
          const analyzed = analyzeResolver(item);
          return {
            ip: item.ip.trim().toLowerCase(),
            asn: String(item.asn || "").trim().toUpperCase(),
            provider: analyzed.provider,
            countryCode: String(item.countryCode || "").trim().toUpperCase()
          };
        });
      return [...new Map(entries.map(item => [item.ip, item])).values()]
        .sort((a, b) => a.ip.localeCompare(b.ip));
    };

    const previous = normalize(previousResolvers);
    const current = normalize(currentResolvers);
    if (!previous.length || !current.length) {
      return {
        state: "unknown",
        changed: false,
        added: [],
        removed: [],
        detail: "Для сравнения нужны два успешных DNS-теста с обнаруженными резолверами."
      };
    }

    const previousByIp = new Map(previous.map(item => [item.ip, item]));
    const currentByIp = new Map(current.map(item => [item.ip, item]));
    const added = current.filter(item => !previousByIp.has(item.ip));
    const removed = previous.filter(item => !currentByIp.has(item.ip));
    const metadataChanges = current.filter(item => {
      const before = previousByIp.get(item.ip);
      return before && (before.asn !== item.asn || before.provider !== item.provider ||
        before.countryCode !== item.countryCode);
    }).map(item => ({ ip: item.ip, before: previousByIp.get(item.ip), after: item }));

    const changed = added.length > 0 || removed.length > 0 || metadataChanges.length > 0;
    return {
      state: changed ? "changed" : "same",
      changed,
      added,
      removed,
      metadataChanges,
      detail: changed
        ? `Добавлено: ${added.length}, исчезло: ${removed.length}, изменились метаданные: ${metadataChanges.length}. Смена VPN-сервера, DNS-маршрута или ротация резолверов может быть нормальной причиной.`
        : "Набор наблюдаемых DNS-резолверов и их метаданные не изменились.",
      previousCount: previous.length,
      currentCount: current.length
    };
  }

  return Object.freeze({ analyzeResolver, analyzeResolvers, summarize, analyzeAnomalies, compareResolverSets });
});

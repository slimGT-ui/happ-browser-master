(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HappAddress = api;
})(globalThis, function () {
  "use strict";

  const IPV4_NON_PUBLIC = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
    ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
  ];

  function ipv4Number(address) {
    if (typeof address !== "string") return null;
    const parts = address.split(".");
    if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
    return parts.reduce((value, part) => (value * 256 + Number(part)) >>> 0, 0);
  }

  function ipv4InRange(address, network, prefix) {
    const value = ipv4Number(address);
    const base = ipv4Number(network);
    if (value === null || base === null) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (base & mask);
  }

  function isPublicIPv4(address) {
    if (ipv4Number(address) === null) return false;
    return !IPV4_NON_PUBLIC.some(([network, prefix]) => ipv4InRange(address, network, prefix));
  }

  function ipv6Number(address) {
    if (typeof address !== "string" || !address.includes(":")) return null;
    let input = address.toLowerCase();
    if (input.includes(".")) {
      const index = input.lastIndexOf(":");
      const v4 = ipv4Number(input.slice(index + 1));
      if (index < 0 || v4 === null) return null;
      const high = ((v4 >>> 16) & 0xffff).toString(16);
      const low = (v4 & 0xffff).toString(16);
      input = input.slice(0, index + 1) + high + ":" + low;
    }
    if (input.includes(":::")) return null;
    const halves = input.split("::");
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
    const groups = [...left, ...Array(missing).fill("0"), ...right];
    if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
    return groups.reduce((value, group) => (value << 16n) | BigInt("0x" + group), 0n);
  }

  function ipv6InRange(value, network, prefix) {
    const base = ipv6Number(network);
    return value !== null && base !== null && (value >> BigInt(128 - prefix)) === (base >> BigInt(128 - prefix));
  }

  function isPublicIPv6(address) {
    const value = ipv6Number(address);
    if (value === null) return false;

    // IPv4-mapped IPv6 addresses inherit the public/private classification of their IPv4 tail.
    if ((value >> 32n) === 0xffffn) {
      const v4 = Number(value & 0xffffffffn);
      const mapped = [v4 >>> 24, (v4 >>> 16) & 255, (v4 >>> 8) & 255, v4 & 255].join(".");
      return isPublicIPv4(mapped);
    }

    // Global unicast space only; exclude documentation and special-purpose 2001::/23.
    return ipv6InRange(value, "2000::", 3) &&
      !ipv6InRange(value, "2001:db8::", 32) &&
      !ipv6InRange(value, "2001::", 23);
  }

  function isPublicIp(address) {
    return isPublicIPv4(address) || isPublicIPv6(address);
  }

  return Object.freeze({ isPublicIPv4, isPublicIPv6, isPublicIp });
});

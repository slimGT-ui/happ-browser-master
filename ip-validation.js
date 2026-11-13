(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HappValidation = api;
})(globalThis, function () {
  "use strict";
  function validIPv4(value) {
    if (typeof value !== "string") return false;
    const parts = value.split(".");
    return parts.length === 4 && parts.every(part =>
      /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255
    );
  }
  function validIPv6(value) {
    if (typeof value !== "string" || !value.includes(":") || value.length > 45 || value.includes("%")) return false;
    let address = value;
    if (address.includes(".")) {
      const lastColon = address.lastIndexOf(":");
      if (lastColon < 0) return false;
      const tail = address.slice(lastColon + 1);
      if (!validIPv4(tail)) return false;
      const octets = tail.split(".").map(Number);
      const high = ((octets[0] << 8) | octets[1]).toString(16);
      const low = ((octets[2] << 8) | octets[3]).toString(16);
      address = address.slice(0, lastColon + 1) + high + ":" + low;
    }
    if (address.includes(":::")) return false;
    const compressed = address.includes("::");
    if (compressed && address.indexOf("::") !== address.lastIndexOf("::")) return false;
    const groups = address.split(":");
    const present = groups.filter(Boolean);
    if (present.some(group => !/^[0-9a-f]{1,4}$/i.test(group))) return false;
    return compressed ? present.length < 8 : groups.length === 8 && present.length === 8;
  }
  function validIp(value) { return validIPv4(value) || validIPv6(value); }
  return Object.freeze({ validIPv4, validIPv6, validIp });
});

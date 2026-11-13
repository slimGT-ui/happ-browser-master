const test = require("node:test");
const assert = require("node:assert/strict");
const { isPublicIPv4, isPublicIPv6, isPublicIp } = require("../ip-classification.js");

test("IPv4 recognizes globally routable addresses", () => {
  for (const ip of ["1.1.1.1", "8.8.8.8", "93.184.216.34"]) assert.equal(isPublicIPv4(ip), true, ip);
});
test("IPv4 excludes private, shared, documentation and special-use ranges", () => {
  for (const ip of [
    "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1",
    "172.16.0.1", "192.0.0.9", "192.0.2.1", "192.88.99.1",
    "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1",
    "224.0.0.1", "240.0.0.1", "not-an-ip"
  ]) assert.equal(isPublicIPv4(ip), false, ip);
});
test("IPv6 recognizes global unicast addresses", () => {
  for (const ip of ["2001:4860:4860::8888", "2606:4700:4700::1111"]) assert.equal(isPublicIPv6(ip), true, ip);
});
test("IPv6 excludes non-global and special-purpose ranges", () => {
  for (const ip of ["::", "::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "2001:db8::1", "2001:1::1", "2002::1", "not-an-ip"]) {
    assert.equal(isPublicIPv6(ip), false, ip);
  }
});
test("IPv4-mapped IPv6 inherits the embedded IPv4 classification", () => {
  assert.equal(isPublicIp("::ffff:8.8.8.8"), true);
  assert.equal(isPublicIp("::ffff:192.168.1.1"), false);
  assert.equal(isPublicIp("::ffff:c000:0201"), false);
});

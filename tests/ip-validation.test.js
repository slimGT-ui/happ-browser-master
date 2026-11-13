const test = require("node:test");
const assert = require("node:assert/strict");
const { validIPv4, validIPv6, validIp } = require("../ip-validation.js");

test("IPv4 accepts valid addresses", () => {
  for (const address of ["0.0.0.0", "1.2.3.4", "192.168.1.1", "255.255.255.255"]) assert.equal(validIPv4(address), true, address);
});
test("IPv4 rejects malformed and out-of-range addresses", () => {
  for (const address of ["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "1.-1.1.1", "1.2.3.x", "1.2.3.999"]) assert.equal(validIPv4(address), false, address);
});
test("IPv6 accepts full, compressed and IPv4-mapped addresses", () => {
  for (const address of ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::1", "::", "::1", "fe80::1234", "::ffff:192.0.2.128"]) assert.equal(validIPv6(address), true, address);
});
test("IPv6 rejects malformed group counts and compression", () => {
  for (const address of ["", ":", "::::", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7:8::", "1::2::3", "12345::", "gggg::1", "2001:db8::192.0.2.999", "fe80::1%eth0"]) assert.equal(validIPv6(address), false, address);
});
test("combined validator accepts either address family only", () => {
  assert.equal(validIp("203.0.113.10"), true);
  assert.equal(validIp("2001:db8::10"), true);
  assert.equal(validIp("not-an-ip"), false);
});

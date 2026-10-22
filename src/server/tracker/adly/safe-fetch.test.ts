import { describe, expect, it } from "vitest";
import { isPublicAddress, vetHost } from "@/server/tracker/adly/safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "102.68.84.10", // Kenyan public range
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ])("allows public %s", (ip) => expect(isPublicAddress(ip)).toBe(true));

  it.each([
    // IPv4 private / loopback / link-local / CGNAT / metadata / special
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "127.10.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.10",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.5",
    "224.0.0.1",
    "255.255.255.255",
    // IPv6 loopback / unspecified / ULA / link-local / multicast / doc
    "::",
    "::1",
    "fc00::1",
    "fd00:ec2::254",
    "fe80::1",
    "fe80::1%eth0",
    "fec0::1",
    "ff02::1",
    "2001:db8::1",
    "2001:0:4136:e378::1", // Teredo
    "100::1",
    // IPv4 inside IPv6
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "::127.0.0.1",
    "64:ff9b::a9fe:a9fe", // NAT64 of 169.254.169.254
    "2002:c0a8:0101::1", // 6to4 of 192.168.1.1
  ])("blocks %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["", "localhost", "999.1.1.1", "1.2.3", "::ffff:999.0.0.1", "gggg::1"])("rejects malformed %j", (ip) =>
    expect(isPublicAddress(ip)).toBe(false)
  );
});

describe("vetHost", () => {
  const resolver = (answers: string[]) => async () => answers.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

  it("returns a vetted public address to pin", async () => {
    await expect(vetHost("cdn.example.org", resolver(["93.184.216.34"]))).resolves.toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("rejects a host when any answer is private (rebinding mix)", async () => {
    await expect(vetHost("evil.example", resolver(["93.184.216.34", "127.0.0.1"]))).rejects.toThrow(/not a public address/);
  });

  it("rejects literal private IPs without resolving", async () => {
    await expect(vetHost("[::1]")).rejects.toThrow(/not a public address/);
    await expect(vetHost("169.254.169.254")).rejects.toThrow(/not a public address/);
  });

  it("rejects hosts that do not resolve", async () => {
    await expect(vetHost("nope.invalid", async () => { throw new Error("ENOTFOUND"); })).rejects.toThrow(/could not be found/);
  });
});

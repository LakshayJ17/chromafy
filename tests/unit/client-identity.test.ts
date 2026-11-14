import { describe, expect, it } from "vitest";
import { getClientAddress, getClientId, normalizeAddress } from "@/lib/security/client-identity";

const headers = (values: Record<string, string>) => new Headers(values);

describe("getClientAddress", () => {
  it("ignores spoofable forwarded headers unless a trusted header is configured", () => {
    expect(getClientAddress(headers({ "x-forwarded-for": "1.2.3.4" }), null)).toBeNull();
  });

  it("uses the first value of the trusted platform header", () => {
    expect(getClientAddress(headers({ "x-vercel-forwarded-for": "203.0.113.9, 10.0.0.1" }), "x-vercel-forwarded-for")).toBe("203.0.113.9");
  });

  it("rejects malformed values", () => {
    expect(getClientAddress(headers({ "x-vercel-forwarded-for": "<script>" }), "x-vercel-forwarded-for")).toBeNull();
  });
});

describe("normalizeAddress", () => {
  it("keeps IPv4 and unwraps IPv4-mapped IPv6", () => {
    expect(normalizeAddress("203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeAddress("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeAddress("999.1.1.1")).toBeNull();
  });

  it("groups IPv6 by /64 so rotating within one connection does not reset the quota", () => {
    const a = normalizeAddress("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = normalizeAddress("2001:0db8:abcd:0012::9");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(b).toBe(a);
    expect(normalizeAddress("2001:db8:abcd:13::1")).not.toBe(a);
  });

  it("rejects malformed IPv6", () => {
    expect(normalizeAddress("1::2::3")).toBeNull();
    expect(normalizeAddress("1:2:3")).toBeNull();
  });
});

describe("getClientId", () => {
  it("is a hash, never the raw address", () => {
    const id = getClientId(headers({ "x-vercel-forwarded-for": "203.0.113.9" }), "x-vercel-forwarded-for");
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain("203");
  });

  it("puts everyone in one shared bucket without a trusted header", () => {
    expect(getClientId(headers({ "x-forwarded-for": "1.1.1.1" }), null)).toBe(getClientId(headers({ "x-forwarded-for": "2.2.2.2" }), null));
  });

  it("treats addresses in the same IPv6 /64 as one person", () => {
    const header = "x-vercel-forwarded-for";
    expect(getClientId(headers({ [header]: "2001:db8:1:2::a" }), header)).toBe(getClientId(headers({ [header]: "2001:db8:1:2::b" }), header));
  });
});

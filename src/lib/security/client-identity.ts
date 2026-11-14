import "server-only";
import { createHash } from "node:crypto";

/**
 * Who counts as "one person" without accounts: the network address reported
 * by a trusted proxy header. Forwarded headers are client-controlled unless a
 * trusted proxy overwrites them, so only the configured header is read.
 * Without one, every caller shares a single bucket: stricter, never bypassable.
 *
 * IPv6 addresses are reduced to their /64 prefix, because one home connection
 * usually controls a whole /64 and could otherwise rotate through endless
 * addresses to reset its quota.
 */
export function getClientAddress(headers: Headers, trustedHeader: string | null): string | null {
  if (!trustedHeader) return null;
  const raw = headers.get(trustedHeader)?.split(",")[0]?.trim();
  if (!raw || raw.length > 64 || !/^[0-9a-fA-F:.]+$/.test(raw)) return null;
  return raw;
}

export function normalizeAddress(address: string): string | null {
  const mapped = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) return normalizeAddress(mapped[1]);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
    return address.split(".").every((part) => Number(part) <= 255) ? address : null;
  }
  if (!address.includes(":")) return null;

  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/**
 * The identifier stored in Redis. It is a hash, so raw addresses are not kept
 * in the rate-limit store. (IPv4 hashes can be brute-forced, so treat them as
 * pseudonymous rather than anonymous.)
 */
export function getClientId(headers: Headers, trustedHeader: string | null): string {
  const address = getClientAddress(headers, trustedHeader);
  const normalized = address ? normalizeAddress(address) : null;
  return createHash("sha256")
    .update(`chromafy:${normalized ?? "shared"}`)
    .digest("hex")
    .slice(0, 32);
}

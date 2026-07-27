import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { AppError } from "./types.js";

const forbiddenHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
]);

function normalizeIp(address: string): ipaddr.IPv4 | ipaddr.IPv6 {
  const parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6") {
    const ipv6 = parsed as ipaddr.IPv6;
    return ipv6.isIPv4MappedAddress() ? ipv6.toIPv4Address() : ipv6;
  }
  return parsed;
}

export function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const range = normalizeIp(address).range();
  return range === "unicast";
}

export function parsePublicHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "ERVENYTELEN_BEMENET", "A megadott URL érvénytelen.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new AppError(
      400,
      "ERVENYTELEN_BEMENET",
      "Csak http vagy https URL adható meg.",
    );
  }
  if (url.username || url.password) {
    throw new AppError(
      400,
      "ERVENYTELEN_BEMENET",
      "Az URL nem tartalmazhat felhasználónevet vagy jelszót.",
    );
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    !hostname ||
    forbiddenHostnames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new AppError(400, "TILTOTT_CIM", "A megadott hálózati cím nem engedélyezett.");
  }

  if (ipaddr.isValid(hostname) && !isPublicIp(hostname)) {
    throw new AppError(400, "TILTOTT_CIM", "A megadott hálózati cím nem engedélyezett.");
  }

  url.hash = "";
  return url;
}

export async function assertPublicUrl(value: string): Promise<URL> {
  const url = parsePublicHttpUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (ipaddr.isValid(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new AppError(400, "TILTOTT_CIM", "A megadott hálózati cím nem engedélyezett.");
    }
    return url;
  }

  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError(400, "ERVENYTELEN_BEMENET", "A weboldal címe nem oldható fel.");
  }

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new AppError(400, "TILTOTT_CIM", "A megadott hálózati cím nem engedélyezett.");
  }
  return url;
}

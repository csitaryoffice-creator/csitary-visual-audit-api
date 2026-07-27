import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { AppError } from "./types.js";

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerAuth(expectedSecret: string): RequestHandler {
  return (req, _res, next) => {
    const match = req.header("authorization")?.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1] || !secretsEqual(match[1], expectedSecret)) {
      next(new AppError(401, "AUTH_HIBA", "Érvénytelen vagy hiányzó hozzáférési token."));
      return;
    }
    next();
  };
}

export type ErrorCode =
  | "AUTH_HIBA"
  | "ERVENYTELEN_BEMENET"
  | "TILTOTT_CIM"
  | "IDO_TULLEPES"
  | "KEPERNYOKEP_HIBA"
  | "ELEMZES_HIBA"
  | "RATE_LIMIT"
  | "BELSO_HIBA";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

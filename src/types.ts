export type ErrorCode =
  | "AUTH_HIBA"
  | "ERVENYTELEN_BEMENET"
  | "TILTOTT_CIM"
  | "IDO_TULLEPES"
  | "OPENAI_IDO_TULLEPES"
  | "ASZTALI_KEPERNYOKEP_IDO_TULLEPES"
  | "MOBIL_KEPERNYOKEP_IDO_TULLEPES"
  | "KEPERNYOKEP_IDO_TULLEPES"
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

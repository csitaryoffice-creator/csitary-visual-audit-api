export type AppConfig = {
  apiSecret: string;
  allowedOrigins: Set<string>;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiSecret = env.API_SECRET?.trim();
  if (!apiSecret) {
    throw new Error("Hiányzik a kötelező API_SECRET környezeti változó.");
  }

  return {
    apiSecret,
    allowedOrigins: new Set(
      (env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  };
}

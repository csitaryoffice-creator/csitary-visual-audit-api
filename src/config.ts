import { z } from "zod";

const serverEnvSchema = z.object({
  API_SECRET: z.string().min(16, "Az API_SECRET legalább 16 karakter legyen."),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ALLOWED_ORIGINS: z.string().default(""),
});

export type AppConfig = {
  apiSecret: string;
  openAiApiKey: string;
  openAiModel: string;
  port: number;
  allowedOrigins: Set<string>;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = serverEnvSchema.parse(env);
  return {
    apiSecret: parsed.API_SECRET,
    openAiApiKey: parsed.OPENAI_API_KEY,
    openAiModel: parsed.OPENAI_MODEL,
    port: parsed.PORT,
    allowedOrigins: new Set(
      parsed.ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  };
}

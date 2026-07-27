import type { AppConfig } from "./config.js";
import { analyzeScreenshots } from "./openai-audit.js";
import { captureScreenshots } from "./screenshot.js";
import { AppError } from "./types.js";
import { assertPublicUrl } from "./url-security.js";

const TOTAL_TIMEOUT_MS = 60_000;

export type AuditService = (
  input: { url: string; leadId?: string },
  config: AppConfig,
) => Promise<Record<string, unknown>>;

function deadline(startedAt: number): () => number {
  return () => {
    const remaining = TOTAL_TIMEOUT_MS - (Date.now() - startedAt);
    if (remaining <= 0) {
      throw new AppError(504, "IDO_TULLEPES", "A kérés túllépte a 60 másodperces időkorlátot.");
    }
    return remaining;
  };
}

export const runVisualAudit: AuditService = async (input, config) => {
  const startedAt = Date.now();
  const remainingMs = deadline(startedAt);
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const timeoutError = new AppError(
    504,
    "IDO_TULLEPES",
    "A kérés túllépte a 60 másodperces időkorlátot.",
  );

  const work = async () => {
    const validatedUrl = await assertPublicUrl(input.url);
    const captures = await captureScreenshots(
      validatedUrl.toString(),
      remainingMs,
      controller.signal,
    );
    const visualAudit = await analyzeScreenshots(
      captures,
      config.openAiApiKey,
      config.openAiModel,
      remainingMs(),
      controller.signal,
    );

    const finalUrl =
      captures.desktop.finalUrl ?? captures.mobile.finalUrl ?? validatedUrl.toString();
    return {
      status: "success",
      ...(input.leadId ? { leadId: input.leadId } : {}),
      url: validatedUrl.toString(),
      finalUrl,
      visualAudit: {
        ...visualAudit,
        desktopAuditAvailable: Boolean(captures.desktop.image),
        mobileAuditAvailable: Boolean(captures.mobile.image),
      },
      modelUsed: config.openAiModel,
      auditedAt: new Date().toISOString(),
    };
  };

  try {
    const hardTimeout = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, TOTAL_TIMEOUT_MS);
    });
    return await Promise.race([work(), hardTimeout]);
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
  }
};

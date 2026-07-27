import type { AppConfig } from "./config.js";
import { analyzeScreenshots } from "./openai-audit.js";
import { captureScreenshots } from "./screenshot.js";
import { AppError } from "./types.js";
import { assertPublicUrl } from "./url-security.js";

const TOTAL_TIMEOUT_MS = 180_000;

export type AuditService = (
  input: { url: string; leadId?: string },
  config: AppConfig,
) => Promise<Record<string, unknown>>;

export const runVisualAudit: AuditService = async (input, config) => {
  const startedAt = Date.now();
  const log = (message: string) => {
    console.info(JSON.stringify({ message, elapsedMs: Date.now() - startedAt }));
  };
  log("audit indult");
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const timeoutError = new AppError(
    504,
    "IDO_TULLEPES",
    "A kérés túllépte a 180 másodperces időkorlátot.",
  );

  const work = async () => {
    const validatedUrl = await assertPublicUrl(input.url);
    log("URL ellenőrzése kész");
    const captures = await captureScreenshots(
      validatedUrl.toString(),
      controller.signal,
      log,
    );
    const visualAudit = await analyzeScreenshots(
      captures,
      config.openAiApiKey,
      config.openAiModel,
      controller.signal,
      log,
    );

    const finalUrl =
      captures.desktop.finalUrl ?? captures.mobile.finalUrl ?? validatedUrl.toString();
    const screenshotIssues = [captures.desktop.issue, captures.mobile.issue].filter(Boolean);
    const result = {
      status: "success",
      ...(input.leadId ? { leadId: input.leadId } : {}),
      url: validatedUrl.toString(),
      finalUrl,
      visualAudit: {
        ...visualAudit,
        desktopAuditAvailable: Boolean(captures.desktop.image),
        mobileAuditAvailable: Boolean(captures.mobile.image),
      },
      ...(screenshotIssues.length > 0 ? { screenshotIssues } : {}),
      modelUsed: config.openAiModel,
      auditedAt: new Date().toISOString(),
    };
    log("audit kész");
    return result;
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

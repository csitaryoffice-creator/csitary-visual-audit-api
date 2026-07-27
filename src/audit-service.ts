import { captureScreenshots } from "./screenshot.js";
import { AppError } from "./types.js";
import { assertPublicUrl } from "./url-security.js";

const TOTAL_TIMEOUT_MS = 180_000;

export type AuditService = (
  input: { url: string; leadId?: string },
) => Promise<Record<string, unknown>>;

function screenshotDataUrl(image: Buffer): string {
  return `data:image/jpeg;base64,${image.toString("base64")}`;
}

export const runVisualAudit: AuditService = async (input) => {
  const startedAt = Date.now();
  const log = (message: string, details?: Record<string, unknown>) => {
    console.info(
      JSON.stringify({
        message,
        elapsedMs: Date.now() - startedAt,
        ...(details ?? {}),
      }),
    );
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

    const finalUrl =
      captures.desktop.finalUrl ?? captures.mobile.finalUrl ?? validatedUrl.toString();
    const screenshotIssues = [captures.desktop.issue, captures.mobile.issue].filter(Boolean);
    const result = {
      status: "success",
      ...(input.leadId ? { leadId: input.leadId } : {}),
      url: validatedUrl.toString(),
      finalUrl,
      screenshots: {
        desktop: captures.desktop.image
          ? {
              available: true,
              mimeType: "image/jpeg",
              width: 1_440,
              height: 1_600,
              sizeBytes: captures.desktop.image.byteLength,
              dataUrl: screenshotDataUrl(captures.desktop.image),
            }
          : { available: false },
        mobile: captures.mobile.image
          ? {
              available: true,
              mimeType: "image/jpeg",
              width: 390,
              height: 1_800,
              sizeBytes: captures.mobile.image.byteLength,
              dataUrl: screenshotDataUrl(captures.mobile.image),
            }
          : { available: false },
      },
      ...(screenshotIssues.length > 0 ? { screenshotIssues } : {}),
      capturedAt: new Date().toISOString(),
    };
    log("audit elkészült");
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

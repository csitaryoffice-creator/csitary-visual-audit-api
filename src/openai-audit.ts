import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import sharp from "sharp";
import { visualAuditSchema, type VisualAudit } from "./schemas.js";
import type { AuditLogger, CaptureResult } from "./screenshot.js";
import { AppError } from "./types.js";

const OPENAI_TIMEOUT_MS = 90_000;
const SYSTEM_PROMPT = `Te egy vizuális és használhatósági weboldal-auditor vagy.
Kizárólag a kapott képernyőképeken ténylegesen látható jellemzőket értékeld, magyarul.
Ne következtess oldalbetöltési sebességre, biztonságra, technikai SEO-ra, CMS-re,
gombok működésére, konverziós eredményekre vagy nem látható aloldalak minőségére.
Minden magyarázat 1–3 közérthető magyar mondat, minden recommendation egy konkrét
magyar fejlesztési javaslat legyen. Az overallSummary 3–5 magyar mondat legyen.
Ha valamelyik nézet hiányzik, ezt vedd figyelembe és az érintett megállapítások
confidence értékét csökkentsd. A desktopAuditAvailable és mobileAuditAvailable
mezőket a bemenetben közölt elérhetőség szerint add vissza.`;

function imageDataUrl(image: Buffer): string {
  return `data:image/jpeg;base64,${image.toString("base64")}`;
}

async function prepareImage(image: Buffer, maxWidth: number): Promise<Buffer> {
  return sharp(image)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();
}

export async function analyzeScreenshots(
  captures: CaptureResult,
  apiKey: string,
  model: string,
  signal: AbortSignal,
  log: AuditLogger,
): Promise<VisualAudit> {
  const client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: 0 });
  const desktopImage = captures.desktop.image
    ? await prepareImage(captures.desktop.image, 1_440)
    : undefined;
  const mobileImage = captures.mobile.image
    ? await prepareImage(captures.mobile.image, 780)
    : undefined;
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "low" }
  > = [
    {
      type: "input_text",
      text: `Asztali kép elérhető: ${Boolean(captures.desktop.image)}. Mobil kép elérhető: ${Boolean(captures.mobile.image)}. Értékeld a rendelkezésre álló képeket a megadott séma szerint.`,
    },
  ];
  if (desktopImage) {
    content.push(
      { type: "input_text", text: "ASZTALI NÉZET (1440×900 viewport):" },
      { type: "input_image", image_url: imageDataUrl(desktopImage), detail: "low" },
    );
  }
  if (mobileImage) {
    content.push(
      { type: "input_text", text: "MOBILNÉZET (390×844 viewport):" },
      { type: "input_image", image_url: imageDataUrl(mobileImage), detail: "low" },
    );
  }

  const openAiController = new AbortController();
  const requestSignal = AbortSignal.any([signal, openAiController.signal]);
  let timeout: NodeJS.Timeout | undefined;
  try {
    timeout = setTimeout(() => openAiController.abort(), OPENAI_TIMEOUT_MS);
    log("OpenAI kérés indult");
    const response = await client.responses.parse(
      {
        model,
        instructions: SYSTEM_PROMPT,
        input: [{ role: "user", content }],
        text: { format: zodTextFormat(visualAuditSchema, "visual_audit") },
      },
      { signal: requestSignal },
    );
    log("OpenAI válasz megérkezett");
    if (!response.output_parsed) {
      throw new Error("Hiányzó strukturált válasz.");
    }
    return visualAuditSchema.parse(response.output_parsed);
  } catch (error) {
    if (signal.aborted) {
      throw new AppError(504, "IDO_TULLEPES", "A kérés túllépte a 180 másodperces időkorlátot.");
    }
    if (
      openAiController.signal.aborted ||
      error instanceof OpenAI.APIConnectionTimeoutError ||
      (error instanceof Error && error.name.toLowerCase().includes("timeout"))
    ) {
      throw new AppError(
        504,
        "OPENAI_IDO_TULLEPES",
        "A vizuális képelemzés nem fejeződött be időben.",
      );
    }
    throw new AppError(
      502,
      "ELEMZES_HIBA",
      "A vizuális elemzés jelenleg nem hajtható végre. Kérjük, próbáld újra később.",
    );
  } finally {
    if (timeout) clearTimeout(timeout);
    openAiController.abort();
  }
}

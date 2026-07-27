import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { visualAuditSchema, type VisualAudit } from "./schemas.js";
import type { CaptureResult } from "./screenshot.js";
import { AppError } from "./types.js";

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

export async function analyzeScreenshots(
  captures: CaptureResult,
  apiKey: string,
  model: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<VisualAudit> {
  const client = new OpenAI({ apiKey, timeout: Math.max(1_000, timeoutMs), maxRetries: 0 });
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    {
      type: "input_text",
      text: `Asztali kép elérhető: ${Boolean(captures.desktop.image)}. Mobil kép elérhető: ${Boolean(captures.mobile.image)}. Értékeld a rendelkezésre álló képeket a megadott séma szerint.`,
    },
  ];
  if (captures.desktop.image) {
    content.push(
      { type: "input_text", text: "ASZTALI NÉZET (1440×900 viewport):" },
      { type: "input_image", image_url: imageDataUrl(captures.desktop.image), detail: "high" },
    );
  }
  if (captures.mobile.image) {
    content.push(
      { type: "input_text", text: "MOBILNÉZET (390×844 viewport):" },
      { type: "input_image", image_url: imageDataUrl(captures.mobile.image), detail: "high" },
    );
  }

  try {
    const response = await client.responses.parse(
      {
        model,
        instructions: SYSTEM_PROMPT,
        input: [{ role: "user", content }],
        text: { format: zodTextFormat(visualAuditSchema, "visual_audit") },
      },
      { signal },
    );
    if (!response.output_parsed) {
      throw new Error("Hiányzó strukturált válasz.");
    }
    return visualAuditSchema.parse(response.output_parsed);
  } catch {
    if (signal.aborted) {
      throw new AppError(504, "IDO_TULLEPES", "A kérés túllépte a 60 másodperces időkorlátot.");
    }
    throw new AppError(
      502,
      "ELEMZES_HIBA",
      "A vizuális elemzés jelenleg nem hajtható végre. Kérjük, próbáld újra később.",
    );
  }
}

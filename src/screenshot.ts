import {
  chromium,
  errors,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from "playwright";
import { assertPublicUrl } from "./url-security.js";
import { AppError } from "./types.js";

const NAVIGATION_TIMEOUT_MS = 25_000;
const POST_LOAD_WAIT_MS = 3_000;
const SCREENSHOT_TIMEOUT_MS = 10_000;

export type AuditLogger = (
  message: string,
  details?: Record<string, unknown>,
) => void;
export type CaptureView = "desktop" | "mobile";
export type CaptureIssue = {
  view: CaptureView;
  code: "KEPERNYOKEP_IDO_TULLEPES" | "KEPERNYOKEP_HIBA";
  message: string;
};

export type ViewCapture = {
  image?: Buffer;
  finalUrl?: string;
  issue?: CaptureIssue;
};

export type CaptureResult = {
  desktop: ViewCapture;
  mobile: ViewCapture;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function safeClosePage(page?: Page): Promise<void> {
  if (!page) return;
  try {
    if (!page.isClosed()) await page.close();
  } catch (error) {
    console.warn("Page lezárása sikertelen", {
      message: errorMessage(error),
    });
  }
}

export async function safeCloseContext(context?: BrowserContext): Promise<void> {
  if (!context) return;
  try {
    await context.close();
  } catch (error) {
    console.warn("Context lezárása kihagyva vagy sikertelen", {
      message: errorMessage(error),
    });
  }
}

export async function safeCloseBrowser(browser?: Browser): Promise<void> {
  if (!browser) return;
  try {
    if (browser.isConnected()) await browser.close();
  } catch (error) {
    console.warn("Browser lezárása sikertelen", {
      message: errorMessage(error),
    });
  }
}

async function secureRoute(route: Route): Promise<void> {
  const url = route.request().url();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    if (route.request().isNavigationRequest() && url !== "about:blank") {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
    return;
  }
  try {
    await assertPublicUrl(url);
    await route.continue();
  } catch {
    await route.abort("blockedbyclient");
  }
}

async function handleCookieBanner(page: Page): Promise<void> {
  try {
    const button = page
      .getByRole("button", {
        name: /összes.*elfogad|elfogadom|elfogadás|accept all|allow all|agree|got it/i,
      })
      .first();
    if (await button.isVisible({ timeout: 500 })) {
      await button.click({ timeout: 750 });
    }
  } catch {
    // A cookie banner kezelése best-effort.
  }
}

async function captureView(
  browser: Browser,
  url: string,
  view: CaptureView,
  signal: AbortSignal,
  log: AuditLogger,
): Promise<ViewCapture> {
  const mobile = view === "mobile";
  const viewport = mobile
    ? { width: 390, height: 1_800 }
    : { width: 1_440, height: 1_600 };
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    if (signal.aborted) {
      throw new AppError(
        504,
        "IDO_TULLEPES",
        "A kérés túllépte a 180 másodperces időkorlátot.",
      );
    }

    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      serviceWorkers: "block",
    });
    log(`${view} context létrejött`);

    await context.route("**/*", secureRoute);
    page = await context.newPage();
    page.setDefaultTimeout(SCREENSHOT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    if (!response) {
      throw new Error("Nincs navigációs válasz.");
    }
    log(`${view} page betöltődött`);

    await page.waitForTimeout(POST_LOAD_WAIT_MS);
    await handleCookieBanner(page);

    const image = await page.screenshot({
      type: "jpeg",
      quality: 65,
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
    log(`${view} screenshot elkészült`);
    return { image, finalUrl: page.url() };
  } catch (error) {
    log(`${view} screenshot sikertelen`, {
      message: errorMessage(error),
    });
    throw error;
  } finally {
    await safeClosePage(page);
    await safeCloseContext(context);
    if (context) log(`${view} context lezárva`);
  }
}

function captureIssue(view: CaptureView, error: unknown): CaptureIssue {
  const timedOut =
    error instanceof errors.TimeoutError ||
    (error instanceof Error && error.name.toLowerCase().includes("timeout"));
  const viewName = view === "desktop" ? "asztali" : "mobil";
  return {
    view,
    code: timedOut ? "KEPERNYOKEP_IDO_TULLEPES" : "KEPERNYOKEP_HIBA",
    message: timedOut
      ? `A(z) ${viewName} nézet betöltése vagy képernyőképének készítése nem fejeződött be időben.`
      : `A(z) ${viewName} nézet képernyőképét nem sikerült elkészíteni.`,
  };
}

export async function captureScreenshots(
  url: string,
  signal: AbortSignal,
  log: AuditLogger,
): Promise<CaptureResult> {
  let browser: Browser | undefined;
  let desktop: ViewCapture = {};
  let mobile: ViewCapture = {};

  try {
    browser = await chromium.launch({ headless: true });
    log("Chromium elindult");

    try {
      desktop = await captureView(browser, url, "desktop", signal, log);
    } catch (error) {
      if (signal.aborted) {
        throw new AppError(
          504,
          "IDO_TULLEPES",
          "A kérés túllépte a 180 másodperces időkorlátot.",
        );
      }
      desktop = { issue: captureIssue("desktop", error) };
    }

    try {
      mobile = await captureView(browser, url, "mobile", signal, log);
    } catch (error) {
      if (signal.aborted) {
        throw new AppError(
          504,
          "IDO_TULLEPES",
          "A kérés túllépte a 180 másodperces időkorlátot.",
        );
      }
      mobile = { issue: captureIssue("mobile", error) };
    }

    if (!desktop.image && !mobile.image) {
      const desktopTimedOut =
        desktop.issue?.code === "KEPERNYOKEP_IDO_TULLEPES";
      const mobileTimedOut =
        mobile.issue?.code === "KEPERNYOKEP_IDO_TULLEPES";
      if (desktopTimedOut || mobileTimedOut) {
        const code =
          desktopTimedOut && !mobileTimedOut
            ? "ASZTALI_KEPERNYOKEP_IDO_TULLEPES"
            : mobileTimedOut && !desktopTimedOut
              ? "MOBIL_KEPERNYOKEP_IDO_TULLEPES"
              : "KEPERNYOKEP_IDO_TULLEPES";
        throw new AppError(
          504,
          code,
          [desktop.issue?.message, mobile.issue?.message]
            .filter(Boolean)
            .join(" "),
        );
      }
      throw new AppError(
        422,
        "KEPERNYOKEP_HIBA",
        "A weboldalról egyik nézetben sem sikerült képernyőképet készíteni.",
      );
    }

    return { desktop, mobile };
  } finally {
    await safeCloseBrowser(browser);
    if (browser) log("browser lezárva");
  }
}

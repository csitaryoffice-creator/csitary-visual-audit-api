import { chromium, type Browser, type Page, type Route } from "playwright";
import { assertPublicUrl } from "./url-security.js";
import { AppError } from "./types.js";

const VIEW_TIMEOUT_MS = 40_000;
const DESKTOP_MAX_HEIGHT = 5_000;
const MOBILE_MAX_HEIGHT = 6_000;

export type AuditLogger = (message: string) => void;
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

class ViewTimeoutError extends Error {
  constructor(public readonly view: CaptureView) {
    super(`${view} screenshot timeout`);
    this.name = "ViewTimeoutError";
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
  const labels = [
    /összes.*elfogad/i,
    /elfogadom/i,
    /elfogadás/i,
    /accept all/i,
    /allow all/i,
    /agree/i,
    /got it/i,
  ];
  for (const label of labels) {
    try {
      const button = page.getByRole("button", { name: label }).first();
      if (await button.isVisible({ timeout: 250 })) {
        await button.click({ timeout: 750 });
        return;
      }
    } catch {
      // A cookie banner kezelése best-effort.
    }
  }
}

async function scrollForLazyContent(page: Page, maxHeight: number): Promise<void> {
  await page.evaluate(async (maxHeight) => {
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    let y = 0;
    while (y < Math.min(document.documentElement.scrollHeight, maxHeight)) {
      y += Math.max(400, Math.floor(window.innerHeight * 0.8));
      window.scrollTo(0, y);
      await delay(120);
    }
    window.scrollTo(0, 0);
    await delay(200);
  }, maxHeight);
}

async function captureView(
  browser: Browser,
  url: string,
  view: CaptureView,
  signal: AbortSignal,
): Promise<ViewCapture> {
  const mobile = view === "mobile";
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const maxHeight = mobile ? MOBILE_MAX_HEIGHT : DESKTOP_MAX_HEIGHT;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: "block",
  });
  const closeOnAbort = () => {
    void context.close();
  };
  try {
    signal.addEventListener("abort", closeOnAbort, { once: true });
    if (signal.aborted) throw new ViewTimeoutError(view);
    await context.route("**/*", secureRoute);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(25_000);

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 25_000,
    });
    if (!response) {
      throw new Error("Nincs navigációs válasz.");
    }

    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await handleCookieBanner(page);
    await scrollForLazyContent(page, maxHeight);

    const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const image = await page.screenshot({
      type: "jpeg",
      quality: 70,
      clip: {
        x: 0,
        y: 0,
        width: viewport.width,
        height: Math.max(1, Math.min(fullHeight, maxHeight)),
      },
    });
    return { image, finalUrl: page.url() };
  } finally {
    signal.removeEventListener("abort", closeOnAbort);
    await context.close();
  }
}

async function captureViewWithTimeout(
  browser: Browser,
  url: string,
  view: CaptureView,
  parentSignal: AbortSignal,
): Promise<ViewCapture> {
  const controller = new AbortController();
  const signal = AbortSignal.any([parentSignal, controller.signal]);
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ViewTimeoutError(view));
    }, VIEW_TIMEOUT_MS);
  });

  try {
    return await Promise.race([captureView(browser, url, view, signal), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
  }
}

function captureIssue(view: CaptureView, error: unknown): CaptureIssue {
  const timedOut = error instanceof ViewTimeoutError;
  const viewName = view === "desktop" ? "asztali" : "mobil";
  return {
    view,
    code: timedOut ? "KEPERNYOKEP_IDO_TULLEPES" : "KEPERNYOKEP_HIBA",
    message: timedOut
      ? `A(z) ${viewName} nézet képernyőképének készítése túllépte a 40 másodperces időkorlátot.`
      : `A(z) ${viewName} nézet képernyőképét nem sikerült elkészíteni.`,
  };
}

export async function captureScreenshots(
  url: string,
  signal: AbortSignal,
  log: AuditLogger,
): Promise<CaptureResult> {
  let browser: Browser | undefined;
  const closeOnAbort = () => {
    void browser?.close();
  };
  try {
    browser = await chromium.launch({ headless: true });
    signal.addEventListener("abort", closeOnAbort, { once: true });
    if (signal.aborted) {
      throw new AppError(504, "IDO_TULLEPES", "A kérés túllépte a 180 másodperces időkorlátot.");
    }
    let desktop: ViewCapture = {};
    let mobile: ViewCapture = {};

    log("asztali oldal betöltése indult");
    try {
      desktop = await captureViewWithTimeout(browser, url, "desktop", signal);
      log("asztali screenshot kész");
    } catch (error) {
      if (signal.aborted) {
        throw new AppError(504, "IDO_TULLEPES", "A kérés túllépte a 180 másodperces időkorlátot.");
      }
      desktop = { issue: captureIssue("desktop", error) };
      log("asztali screenshot sikertelen");
    }

    log("mobil oldal betöltése indult");
    try {
      mobile = await captureViewWithTimeout(browser, url, "mobile", signal);
      log("mobil screenshot kész");
    } catch (error) {
      if (signal.aborted) {
        throw new AppError(504, "IDO_TULLEPES", "A kérés túllépte a 180 másodperces időkorlátot.");
      }
      mobile = { issue: captureIssue("mobile", error) };
      log("mobil screenshot sikertelen");
    }

    if (!desktop.image && !mobile.image) {
      const desktopTimedOut = desktop.issue?.code === "KEPERNYOKEP_IDO_TULLEPES";
      const mobileTimedOut = mobile.issue?.code === "KEPERNYOKEP_IDO_TULLEPES";
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
          [desktop.issue?.message, mobile.issue?.message].filter(Boolean).join(" "),
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
    signal.removeEventListener("abort", closeOnAbort);
    await browser?.close();
  }
}

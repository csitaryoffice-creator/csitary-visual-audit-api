import { chromium, type Browser, type Page, type Route } from "playwright";
import { assertPublicUrl } from "./url-security.js";
import { AppError } from "./types.js";

const MAX_PAGE_HEIGHT = 12_000;

export type ViewCapture = {
  image?: Buffer;
  finalUrl?: string;
};

export type CaptureResult = {
  desktop: ViewCapture;
  mobile: ViewCapture;
};

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

async function scrollForLazyContent(page: Page): Promise<void> {
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
  }, MAX_PAGE_HEIGHT);
}

async function captureView(
  browser: Browser,
  url: string,
  mobile: boolean,
  timeoutMs: number,
): Promise<ViewCapture> {
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: "block",
  });
  try {
    await context.route("**/*", secureRoute);
    const page = await context.newPage();
    page.setDefaultTimeout(Math.min(timeoutMs, 10_000));
    page.setDefaultNavigationTimeout(Math.min(timeoutMs, 20_000));

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(timeoutMs, 20_000),
    });
    if (!response) {
      throw new Error("Nincs navigációs válasz.");
    }

    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 5_000) }).catch(() => {});
    await handleCookieBanner(page);
    await scrollForLazyContent(page);

    const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const image =
      fullHeight <= MAX_PAGE_HEIGHT
        ? await page.screenshot({ type: "jpeg", quality: 80, fullPage: true })
        : await page.screenshot({
            type: "jpeg",
            quality: 80,
            clip: {
              x: 0,
              y: 0,
              width: viewport.width,
              height: MAX_PAGE_HEIGHT,
            },
          });
    return { image, finalUrl: page.url() };
  } finally {
    await context.close();
  }
}

export async function captureScreenshots(
  url: string,
  remainingMs: () => number,
  signal: AbortSignal,
): Promise<CaptureResult> {
  let browser: Browser | undefined;
  const closeOnAbort = () => {
    void browser?.close();
  };
  try {
    browser = await chromium.launch({ headless: true });
    signal.addEventListener("abort", closeOnAbort, { once: true });
    if (signal.aborted) {
      throw new AppError(504, "IDO_TULLEPES", "A kérés túllépte a 60 másodperces időkorlátot.");
    }
    let desktop: ViewCapture = {};
    let mobile: ViewCapture = {};

    try {
      desktop = await captureView(browser, url, false, remainingMs());
    } catch {
      desktop = {};
    }
    if (remainingMs() > 2_000) {
      try {
        mobile = await captureView(browser, url, true, remainingMs());
      } catch {
        mobile = {};
      }
    }

    if (!desktop.image && !mobile.image) {
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

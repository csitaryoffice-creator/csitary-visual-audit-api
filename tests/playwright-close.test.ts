import type { Browser, BrowserContext, Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import {
  safeCloseBrowser,
  safeCloseContext,
  safeClosePage,
} from "../src/screenshot.js";

describe("Playwright erőforrások biztonságos lezárása", () => {
  it("egy bezárási hiba sem jut tovább a hívóhoz", async () => {
    const closeError = new Error("már lezárt erőforrás");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const page = {
      isClosed: vi.fn().mockReturnValue(false),
      close: vi.fn().mockRejectedValue(closeError),
    } as unknown as Page;
    const context = {
      close: vi.fn().mockRejectedValue(closeError),
    } as unknown as BrowserContext;
    const browser = {
      isConnected: vi.fn().mockReturnValue(true),
      close: vi.fn().mockRejectedValue(closeError),
    } as unknown as Browser;

    await expect(safeClosePage(page)).resolves.toBeUndefined();
    await expect(safeCloseContext(context)).resolves.toBeUndefined();
    await expect(safeCloseBrowser(browser)).resolves.toBeUndefined();

    expect(page.close).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("nem zárja be újra a már lezárt page-et vagy disconnected browsert", async () => {
    const page = {
      isClosed: vi.fn().mockReturnValue(true),
      close: vi.fn(),
    } as unknown as Page;
    const browser = {
      isConnected: vi.fn().mockReturnValue(false),
      close: vi.fn(),
    } as unknown as Browser;

    await safeClosePage(page);
    await safeCloseBrowser(browser);

    expect(page.close).not.toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();
  });
});

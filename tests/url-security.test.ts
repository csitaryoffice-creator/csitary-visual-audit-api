import { describe, expect, it } from "vitest";
import { isPublicIp, parsePublicHttpUrl } from "../src/url-security.js";

describe("URL-validáció", () => {
  it("elfogad nyilvános http és https URL-eket", () => {
    expect(parsePublicHttpUrl("https://example.com/path").hostname).toBe("example.com");
    expect(parsePublicHttpUrl("http://93.184.216.34").protocol).toBe("http:");
  });

  it("elutasítja a nem HTTP protokollokat és a hitelesítési adatot", () => {
    expect(() => parsePublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => parsePublicHttpUrl("https://user:pass@example.com")).toThrow();
  });

  it("elutasítja a localhostot és a privát/speciális IP-ket", () => {
    for (const url of [
      "http://localhost",
      "http://127.0.0.1",
      "http://0.0.0.0",
      "http://[::1]",
      "http://10.0.0.1",
      "http://172.16.0.1",
      "http://192.168.1.1",
      "http://169.254.169.254",
      "http://[fc00::1]",
    ]) {
      expect(() => parsePublicHttpUrl(url), url).toThrow();
    }
  });

  it("helyesen osztályoz alapvető IP-tartományokat", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("192.168.1.1")).toBe(false);
    expect(isPublicIp("::1")).toBe(false);
  });
});

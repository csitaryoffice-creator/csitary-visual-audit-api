import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("szerverkonfiguráció", () => {
  it("pontosan megnevezi a hiányzó API_SECRET változót", () => {
    expect(() => loadConfig({})).toThrow(
      "Hiányzik a kötelező API_SECRET környezeti változó.",
    );
  });

  it("OpenAI-, PORT- és ALLOWED_ORIGINS-változó nélkül is betöltődik", () => {
    expect(loadConfig({ API_SECRET: "teszt-titok" })).toEqual({
      apiSecret: "teszt-titok",
      allowedOrigins: new Set(),
    });
  });
});

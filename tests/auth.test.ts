import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

const config: AppConfig = {
  apiSecret: "egy-nagyon-hosszu-teszt-titok",
  allowedOrigins: new Set(),
};

describe("Bearer autentikáció", () => {
  it("elutasítja a hiányzó vagy hibás tokent", async () => {
    const service = vi.fn();
    const app = createApp(config, service);

    const missing = await request(app).post("/visual-audit").send({ url: "https://example.com" });
    const invalid = await request(app)
      .post("/visual-audit")
      .set("Authorization", "Bearer hibas")
      .send({ url: "https://example.com" });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(missing.body).toEqual({
      status: "error",
      code: "AUTH_HIBA",
      message: "Érvénytelen vagy hiányzó hozzáférési token.",
    });
    expect(service).not.toHaveBeenCalled();
  });

  it("helyes tokennel továbbengedi a kérést", async () => {
    const service = vi.fn().mockResolvedValue({ status: "success" });
    const app = createApp(config, service);

    const response = await request(app)
      .post("/visual-audit")
      .set("Authorization", `Bearer ${config.apiSecret}`)
      .send({ url: "https://example.com", leadId: "lead-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "success" });
    expect(service).toHaveBeenCalledOnce();
  });
});

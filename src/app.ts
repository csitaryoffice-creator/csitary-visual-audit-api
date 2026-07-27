import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { ZodError } from "zod";
import { bearerAuth } from "./auth.js";
import type { AuditService } from "./audit-service.js";
import { runVisualAudit } from "./audit-service.js";
import type { AppConfig } from "./config.js";
import { requestSchema } from "./schemas.js";
import { AppError } from "./types.js";

export function createApp(config: AppConfig, auditService: AuditService = runVisualAudit) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.allowedOrigins.has(origin)) return callback(null, true);
        return callback(new AppError(403, "AUTH_HIBA", "Ez a webes eredet nincs engedélyezve."));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "20kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post(
    "/visual-audit",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler(_req, res) {
        res.status(429).json({
          status: "error",
          code: "RATE_LIMIT",
          message: "Túl sok kérés érkezett. Kérjük, próbáld újra később.",
        });
      },
    }),
    bearerAuth(config.apiSecret),
    async (req, res, next) => {
      try {
        const input = requestSchema.parse(req.body);
        const result = await auditService(input);
        res.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.use((_req, res) => {
    res.status(404).json({
      status: "error",
      code: "ERVENYTELEN_BEMENET",
      message: "A kért végpont nem található.",
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        status: "error",
        code: error.code,
        message: error.message,
      });
      return;
    }
    if (error instanceof ZodError || error instanceof SyntaxError) {
      res.status(400).json({
        status: "error",
        code: "ERVENYTELEN_BEMENET",
        message: "A kérés tartalma érvénytelen.",
      });
      return;
    }
    console.error("Nem várt kérésfeldolgozási hiba.");
    res.status(500).json({
      status: "error",
      code: "BELSO_HIBA",
      message: "Váratlan hiba történt. Kérjük, próbáld újra később.",
    });
  };
  app.use(errorHandler);

  return app;
}

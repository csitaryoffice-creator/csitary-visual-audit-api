import { z } from "zod";

export const requestSchema = z
  .object({
    url: z.string().min(1).max(2048),
    leadId: z.string().min(1).max(200).optional(),
  })
  .strict();

const criterionSchema = z.object({
  score: z.number().int().min(1).max(5),
  explanation: z.string(),
  recommendation: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const visualAuditSchema = z.object({
  visualHierarchy: criterionSchema,
  readability: criterionSchema,
  typography: criterionSchema,
  colorContrast: criterionSchema,
  spacingAndDensity: criterionSchema,
  navigationClarity: criterionSchema,
  ctaVisibility: criterionSchema,
  mobileLayout: criterionSchema,
  visualConsistency: criterionSchema,
  trustAndProfessionalism: criterionSchema,
  overallVisualScore: z.number().int().min(0).max(100),
  overallSummary: z.string(),
  topIssues: z.array(z.string()).max(5),
  topStrengths: z.array(z.string()).max(3),
  desktopAuditAvailable: z.boolean(),
  mobileAuditAvailable: z.boolean(),
});

export type VisualAudit = z.infer<typeof visualAuditSchema>;

import { z } from "zod";

export const requestSchema = z
  .object({
    url: z.string().min(1).max(2048),
    leadId: z.string().min(1).max(200).optional(),
  })
  .strict();

import { z } from "zod";

export const HowToLoginDetailsSchema = z
  .object({
    url: z.string().max(500).optional().default(""),
    email: z.string().max(320).optional().default(""),
    username: z.string().max(160).optional().default(""),
    notes: z.string().max(2000).optional().default(""),
  })
  .optional()
  .default({});

export const HowToSecretInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "Secret label is required").max(120),
  value: z.string().max(3000),
});

export const HowToCreateRequestSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  category: z.string().trim().max(120).optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  keywords: z.array(z.string()).optional().default([]),
  summary: z.string().max(2000).optional().default(""),
  contentJson: z.unknown().optional(),
  loginDetails: HowToLoginDetailsSchema,
  secrets: z.array(HowToSecretInputSchema).optional().default([]),
});

export const HowToUpdateRequestSchema = HowToCreateRequestSchema.partial().extend({
  secrets: z.array(HowToSecretInputSchema).optional(),
});

export type HowToCreateRequest = z.infer<typeof HowToCreateRequestSchema>;
export type HowToUpdateRequest = z.infer<typeof HowToUpdateRequestSchema>;
export type HowToSecretInput = z.infer<typeof HowToSecretInputSchema>;

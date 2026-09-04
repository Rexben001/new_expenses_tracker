import { z } from "zod";

const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Date must be in yyyy-MM-dd format",
});

export const CalendarTransferRequestSchema = z
  .object({
    recipientEmail: z.string().trim().email("Enter a valid recipient email"),
    mode: z.enum(["copy", "move"]).default("copy"),
    conflictPolicy: z.enum(["merge", "skip", "replace"]).default("merge"),
    dateFrom: CalendarDateSchema.optional(),
    dateTo: CalendarDateSchema.optional(),
  })
  .refine(
    ({ dateFrom, dateTo }) => !dateFrom || !dateTo || dateFrom <= dateTo,
    { message: "Start date must be before or equal to end date", path: ["dateTo"] }
  );

export const CalendarTransferAcceptSchema = z.object({
  code: z
    .string()
    .trim()
    .min(8, "Transfer code is required")
    .max(32, "Transfer code is invalid"),
});

export type CalendarTransferRequest = z.infer<
  typeof CalendarTransferRequestSchema
>;

export type CalendarTransferAccept = z.infer<
  typeof CalendarTransferAcceptSchema
>;

import { z } from "zod";

export const CalendarStatusSchema = z.enum(["available", "booked"]);

export const HairStyleOptionSchema = z.enum([
  "kinky",
  "boho",
  "knotless",
  "ghana weaving",
  "jayda wayda",
]);

export const HairSizeOptionSchema = z.enum([
  "small",
  "smedium",
  "medium",
  "large",
]);

export const HairLengthOptionSchema = z.enum(["shoulder", "bra", "waist"]);

export const HairStyleSchema = z.object({
  style: HairStyleOptionSchema.optional().default("knotless"),
  size: HairSizeOptionSchema.optional().default("medium"),
  length: HairLengthOptionSchema.optional().default("bra"),
  additionalDetails: z.string().optional(),
});
export type HairStyle = z.infer<typeof HairStyleSchema>;

export const CalendarClientSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Client name is required"),
  startTime: z.string().optional(),
  hairStyle: HairStyleSchema.optional().default({
    style: "knotless",
    size: "medium",
    length: "bra",
  }),
  email: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});
export type CalendarClient = z.infer<typeof CalendarClientSchema>;

const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Date must be in yyyy-MM-dd format",
});

export const CalendarEntrySchema = z.object({
  id: z.string().uuid(),
  date: CalendarDateSchema,
  status: CalendarStatusSchema.default("available"),
  clients: z.array(CalendarClientSchema).default([]),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
  userId: z.string().uuid().optional(),
  subAccountId: z.any().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Date must be a valid date string",
  }),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;

export const CalendarEntryRequestSchema = z.object({
  date: CalendarDateSchema,
  status: CalendarStatusSchema.optional(),
  clients: z.array(CalendarClientSchema).optional().default([]),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
  userId: z.string().uuid().optional(),
  subAccountId: z.any().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CalendarEntryRequest = z.infer<typeof CalendarEntryRequestSchema>;

export const CalendarEntryUpdateRequestSchema = z.object({
  date: CalendarDateSchema.optional(),
  status: CalendarStatusSchema.optional(),
  clients: z.array(CalendarClientSchema).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().optional(),
  userId: z.string().uuid().optional(),
  subAccountId: z.any().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CalendarEntryUpdateRequest = z.infer<
  typeof CalendarEntryUpdateRequestSchema
>;

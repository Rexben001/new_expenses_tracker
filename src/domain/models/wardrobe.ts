import { z } from "zod";

export const WardrobeCategorySchema = z.enum([
  "top",
  "shirt",
  "dress",
  "blazer-jacket",
  "trousers",
  "skirt",
]);

export const WardrobeColorFamilySchema = z.enum([
  "black",
  "white",
  "gray",
  "beige",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
]);

export const WardrobeColorToneSchema = z.enum(["dark", "light"]);

export const WardrobeItemPayloadSchema = z.object({
  id: z.string().uuid(),
  imageKey: z.string().min(1).max(1024),
  name: z.string().trim().min(1, "Name is required").max(120),
  category: WardrobeCategorySchema,
  colorFamily: WardrobeColorFamilySchema,
  colorHex: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Color must use #RRGGBB format")
    .transform((value) => value.toLowerCase()),
  colorTone: WardrobeColorToneSchema,
  favorite: z.boolean(),
});

export const WardrobeItemUpdateSchema = WardrobeItemPayloadSchema.omit({
  id: true,
  imageKey: true,
})
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const WardrobeUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.literal("image/png"),
});

export const WardrobeDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    { message: "Date is invalid" }
  );

export const WardrobePlanDaySchema = z
  .object({
    date: WardrobeDateSchema,
    itemIds: z.array(z.string().uuid()).max(3),
    lockedItemIds: z.array(z.string().uuid()).max(3),
    favorite: z.boolean(),
  })
  .superRefine((day, context) => {
    const itemIds = new Set(day.itemIds);
    if (itemIds.size !== day.itemIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemIds"],
        message: "Item IDs must be unique",
      });
    }

    const lockedItemIds = new Set(day.lockedItemIds);
    if (lockedItemIds.size !== day.lockedItemIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lockedItemIds"],
        message: "Locked item IDs must be unique",
      });
    }

    for (const lockedItemId of lockedItemIds) {
      if (!itemIds.has(lockedItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lockedItemIds"],
          message: "Locked items must be included in the outfit",
        });
        break;
      }
    }
  });

export const WardrobeWeekPlanRequestSchema = z.object({
  weekStart: WardrobeDateSchema.optional(),
  generation: z.number().int().min(1),
  days: z
    .array(WardrobePlanDaySchema)
    .length(7, "A weekly plan must contain exactly seven days"),
});

export type WardrobeItemPayload = z.infer<typeof WardrobeItemPayloadSchema>;
export type WardrobeItemUpdate = z.infer<typeof WardrobeItemUpdateSchema>;
export type WardrobeWeekPlanRequest = z.infer<
  typeof WardrobeWeekPlanRequestSchema
>;

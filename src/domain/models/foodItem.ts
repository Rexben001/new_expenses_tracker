import { z } from "zod";

export const FoodCategorySchema = z.enum([
  "food",
  "drink",
  "spice",
  "ingredient",
  "soup",
  "cooked",
  "other",
]);

export const FoodLifecycleStatusSchema = z.enum([
  "active",
  "finished",
  "wasted",
]);

const OptionalDateSchema = z
  .string()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Expiry date must use YYYY-MM-DD format",
  })
  .optional();

const FoodItemFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  category: FoodCategorySchema,
  quantity: z.number().finite().min(0),
  unit: z.string().trim().min(1, "Unit is required").max(40),
  minimumQuantity: z.number().finite().min(0),
  expiryDate: OptionalDateSchema,
  cookedDate: OptionalDateSchema,
  location: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  buy: z.boolean(),
  opened: z.boolean().optional().default(false),
  lifecycleStatus: FoodLifecycleStatusSchema.optional().default("active"),
  completedAt: z.string().optional(),
  freezable: z.boolean().optional().default(false),
  freezeExtensionDays: z.number().int().min(1).max(730).optional(),
  estimatedValue: z.number().finite().min(0).max(100000).optional(),
  estimatedWeightKg: z.number().finite().min(0).max(10000).optional(),
};

export const FoodItemRequestSchema = z.object(FoodItemFields);

export const FoodItemUpdateRequestSchema = z
  .object({
    name: FoodItemFields.name,
    category: FoodItemFields.category,
    quantity: FoodItemFields.quantity,
    unit: FoodItemFields.unit,
    minimumQuantity: FoodItemFields.minimumQuantity,
    expiryDate: FoodItemFields.expiryDate,
    cookedDate: FoodItemFields.cookedDate,
    location: FoodItemFields.location,
    notes: FoodItemFields.notes,
    buy: FoodItemFields.buy,
    opened: z.boolean(),
    lifecycleStatus: FoodLifecycleStatusSchema,
    completedAt: z.string(),
    freezable: z.boolean(),
    freezeExtensionDays: z.number().int().min(1).max(730),
    estimatedValue: z.number().finite().min(0).max(100000),
    estimatedWeightKg: z.number().finite().min(0).max(10000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const FoodItemSchema = FoodItemRequestSchema.extend({
  id: z.string().uuid(),
  userId: z.string().optional(),
  subAccountId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FoodItem = z.infer<typeof FoodItemSchema>;
export type FoodItemRequest = z.infer<typeof FoodItemRequestSchema>;

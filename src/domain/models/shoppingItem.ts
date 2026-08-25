import { z } from "zod";

export const ShoppingItemRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().min(1, "Unit is required").max(40),
  category: z.string().trim().min(1, "Category is required").max(60),
  notes: z.string().trim().max(500).optional(),
});

export type ShoppingItemRequest = z.infer<typeof ShoppingItemRequestSchema>;

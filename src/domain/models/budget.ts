import { z } from "zod";

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  amount: z.number().positive("Amount must be a positive number"),
  description: z.string().optional(),
  period: z.enum(["monthly", "yearly"], {
    message: 'Period must be either "monthly" or "yearly"',
  }),
  createdAt: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  userId: z.string().uuid(),
});
export type Budget = z.infer<typeof BudgetSchema>;

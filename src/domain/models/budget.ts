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
  updatedAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Date must be a valid date string",
  }),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const BudgetRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.number().positive("Amount must be a positive number"),
  description: z.string().optional(),
  period: z.enum(["monthly", "yearly"], {
    message: 'Period must be either "monthly" or "yearly"',
  }),
  currency: z.string().min(1, "Currency is required"),
  userId: z.string().uuid().optional(),
});
export type BudgetRequest = z.infer<typeof BudgetRequestSchema>;

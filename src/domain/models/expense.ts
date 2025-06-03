import { z } from "zod";

export const ExpenseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  amount: z.number().positive("Amount must be a positive number"),
  updatedAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Date must be a valid date string",
  }),
  categoryId: z.string().uuid().optional(),
  budgetId: z.string().uuid().optional(),
  description: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  userId: z.string().uuid().optional(),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const ExpenseRequestSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.number().positive("Amount must be a positive number"),
  categoryId: z.string().uuid().optional(),
  budgetId: z.string().uuid().optional(),
  description: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  userId: z.string().uuid().optional(),
});
export type ExpenseRequest = z.infer<typeof ExpenseRequestSchema>;

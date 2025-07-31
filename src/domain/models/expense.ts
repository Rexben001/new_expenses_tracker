import { z } from "zod";

export const ExpenseSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  amount: z.number().positive("Amount must be a positive number"),
  updatedAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Date must be a valid date string",
  }),
  category: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  userId: z.string().uuid().optional(),
  upcoming: z.boolean().default(false),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const ExpenseRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  amount: z.number().positive("Amount must be a positive number"),
  category: z.string().optional(),
  budgetId: z.string().optional().nullable(),
  description: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  userId: z.string().uuid().optional(),
  updatedAt: z.string().optional(),
  upcoming: z.boolean().optional().default(false),
});
export type ExpenseRequest = z.infer<typeof ExpenseRequestSchema>;

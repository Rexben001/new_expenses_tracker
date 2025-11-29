import { z } from "zod";

export const BudgetSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  amount: z.number().positive("Amount must be a positive number"),
  description: z.string().optional(),
  period: z
    .enum(["monthly", "yearly"], {
      message: 'Period must be either "monthly" or "yearly"',
    })
    .optional(),
  createdAt: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  userId: z.string().uuid(),
  updatedAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Date must be a valid date string",
  }),
  category: z.string().optional(),
  upcoming: z.boolean().default(false),
  favorite: z.boolean().default(false),
  subAccountId: z.any().optional(),
  oldBudgetId: z.string().uuid().optional(),
  isRecurring: z.boolean().default(false),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const BudgetRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  amount: z.number().positive("Amount must be a positive number"),
  description: z.string().optional(),
  period: z
    .enum(["monthly", "yearly"], {
      message: 'Period must be either "monthly" or "yearly"',
    })
    .optional(),
  currency: z.string().min(1, "Currency is required"),
  userId: z.string().uuid().optional(),
  category: z.string().optional(),
  updatedAt: z.string().optional(),
  upcoming: z.boolean().optional().default(false),
  favorite: z.boolean().default(false),
  subAccountId: z.any().optional(),
  isRecurring: z.boolean().default(false),
});
export type BudgetRequest = z.infer<typeof BudgetRequestSchema>;

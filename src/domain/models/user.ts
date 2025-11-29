import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1, "Username is required"),
  email: z.string().email("Invalid email address"),
  currency: z.string().min(1, "Currency is required").optional(),
  createdAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Date must be a valid date string",
  }),
  subAccounts: z
    .array(
      z.object({
        id: z.string().uuid(),
        subAccountId: z.string().uuid(),
        name: z.string().min(1, "Sub-account name is required"),
        createdAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
          message: "Date must be a valid date string",
        }),
      })
    )
    .optional(),
});
export type User = z.infer<typeof UserSchema>;

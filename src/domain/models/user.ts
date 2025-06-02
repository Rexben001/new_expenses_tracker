import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  currency: z.string().min(1, "Currency is required").optional(),
});
export type User = z.infer<typeof UserSchema>;
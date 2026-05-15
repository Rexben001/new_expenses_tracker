import { z } from "zod";

export const TaskPrioritySchema = z.enum(["low", "medium", "high"]);

export const SubTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Subtask title is required"),
  completed: z.boolean().optional().default(false),
});

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  group: z.string().optional(),
  tags: z.array(z.string()).default([]),
  subtasks: z.array(SubTaskSchema).optional().default([]),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  completed: z.boolean().default(false),
  priority: TaskPrioritySchema.default("medium"),
  userId: z.string().uuid().optional(),
  subAccountId: z.any().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: "Date must be a valid date string",
  }),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  group: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  subtasks: z.array(SubTaskSchema).optional().default([]),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  completed: z.boolean().optional().default(false),
  priority: TaskPrioritySchema.optional().default("medium"),
  userId: z.string().uuid().optional(),
  subAccountId: z.any().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type TaskRequest = z.infer<typeof TaskRequestSchema>;

export const TaskUpdateRequestSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional(),
  group: z.string().optional(),
  tags: z.array(z.string()).optional(),
  subtasks: z.array(SubTaskSchema).optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  completed: z.boolean().optional(),
  priority: TaskPrioritySchema.optional(),
  userId: z.string().uuid().optional(),
  subAccountId: z.any().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type TaskUpdateRequest = z.infer<typeof TaskUpdateRequestSchema>;

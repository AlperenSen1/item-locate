import { describe, z } from "zod";
import { itemStatusEnum, roleEnum } from "@item-locate/validators";

export const loginSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters" }),
  tenantId: z.uuid("Invalid tenant ID").optional(),
});

export const registerSchema = loginSchema.extend({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
});

export const idParamSchema = z.object({
  id: z.uuid(),
})

export const postContainerSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  description: z.string().optional(),
  location: z.string().optional(),
  className: z.string().optional(),
  isHidden: z.boolean().optional(),
});

export const postItemSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  category: z.string().optional(),
  location: z.string().optional(),
  className: z.string().optional(),
  isPinned: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});

export const containerItemSchema = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
});

export const postTenantsUsersSchema = z.object({
  users: z.array(z.object({ userId: z.uuid(), role: roleEnum })),
})

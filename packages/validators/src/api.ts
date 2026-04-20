import { z } from "zod";

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

export const tenantSchema = z.object({
  id: z.uuid(),
})

export const membersTenantsSchema = tenantSchema.extend({
  email: z.email().optional(),
})

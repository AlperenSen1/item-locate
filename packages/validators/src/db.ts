
import { z } from "zod";

export const itemStatusEnum = z.enum([
  "with_you",
  "missing",
  "not_set",
  "stored"
]);

export type ItemStatus = z.infer<typeof itemStatusEnum>;


export const roleEnum = z.enum([
  "admin",
  "member"
]);

export type Role = z.infer<typeof roleEnum>;

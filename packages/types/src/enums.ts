
import { z } from "zod";

export const itemStatusEnum = z.enum([
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


export const itemClassNameEnum = z.enum([
  "diamond",
  "circle",
  "triangle",
  "flower",
  "hexagon",
  "shield",
  "layers",
  "clover",
  "star",
  "heart",
  "sparkle",
  "warning",
  "asterisk",
  "home",
  "family",
  "person",
  "people",
  "medical",
  "pills",
  "bandage",
  "thermometer",
  "stethoscope",
  "pulse",
  "ear",
  "injection",
  "pen",
  "bottle",
  "flashlight",
  "extinguisher",
]);

export type ItemClassName = z.infer<typeof itemClassNameEnum>;

export const containerClassNameEnum = z.enum([
  "square",
  "diamond",
  "circle",
  "triangle",
  "flower",
  "hexagon",
  "shield",
  "layers",
  "clover",
  "box",
  "open-box",
  "briefcase",
  "drawer",
  "shelf",
  "stack",
  "cabinet",
  "bag",
  "toolbox",
]);

export type ContainerClassName = z.infer<typeof containerClassNameEnum>;

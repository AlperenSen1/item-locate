import { itemStatusEnum, roleEnum, itemClassNameEnum, containerClassNameEnum } from "@item-locate/types";
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

export const idParamSchema = z.object({
  id: z.uuid(),
})

export const postContainerSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  className: containerClassNameEnum.optional(),
  description: z.string().optional(),
  embedding: z.array(z.number()).length(768).optional(),
  premiseId: z.uuid().optional(),
});

export const patchContainerSchema = z
  .object({
    name: z.string().min(1).optional(),
    isHidden: z.boolean().optional(),
    className: containerClassNameEnum.optional(),
    description: z.string().min(1).optional(),
    premiseId: z.uuid().optional(),
    embedding: z.array(z.number()).length(768).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export const postItemSchema = z
  .object({
    name: z.string().min(1, { message: "Name is required" }),
    className: itemClassNameEnum.optional(),
    categoryId: z.uuid().optional(),
    locationDescription: z.string().min(1).optional(),
    containerId: z.uuid().optional(),
  });

// schemas.ts
export const patchItemSchema = z
  .object({
    name: z.string().min(1).optional(),
    className: itemClassNameEnum.optional(),
    isPinned: z.boolean().optional(),
    isHidden: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export const moveItemSchema = z
  .object({
    containerId: z.uuid().optional(),
    locationDescription: z.string().min(1).optional(),
  })
  .refine((d) => !!(d.containerId || d.locationDescription), {
    message: "Either containerId or locationDescription must be provided",
  });

export const postItemCategorySchema = z.object({
  names: z
    .record(z.string(), z.string().min(1))
    .refine((val) => "en" in val, {
      message: "English translation is required",
    }),
});


export const analyzeLocationSchema = z.object({
  itemName: z.string().min(1, "itemName is required"),
  photo: z
    .instanceof(File)
    .refine((f) => f.size > 0, "Empty file")
    .refine((f) => f.type === "image/jpeg", "Must be a JPEG"),
});

export const analyzeContainerSchema = z
  .object({
    name: z.string().min(1, { message: "Name is required" }),
    lat: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.coerce.number().min(-90).max(90).optional()
    ),
    lng: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.coerce.number().min(-180).max(180).optional()
    ),
  })
  .refine((d) => (d.lat === undefined) === (d.lng === undefined), {
    message: "lat and lng must be provided together",
    path: ["lat"],
  });


export const storeParamSchema = z.object({
  id: z.uuid(),
  containerId: z.uuid(),
});

export const postTenantsUsersSchema = z.object({
  users: z.array(z.object({ userId: z.uuid(), role: roleEnum })),
})

export const postPremiseSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  location: z.object({
    x: z.number(),
    y: z.number(),
  })
})

export const patchPremiseSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.object({
    x: z.number(),
    y: z.number(),
  }).optional()
})

export const pathAnalyzeSchema = z.object({
  closeUpPath: z.string(),
  widePath: z.string(),
})

export const whereaboutsActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("took_it") }),
  z.object({ action: z.literal("left_it") }),
  z.object({ action: z.literal("move_it"), containerId: z.uuid() }),
  z.object({ action: z.literal("not_there") }),
  z.object({ action: z.literal("mark_not_set") }),
]);

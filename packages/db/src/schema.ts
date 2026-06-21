import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  primaryKey,
  pgEnum,
  jsonb,
  unique,
  point,
  vector,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { v7 as uuidv7 } from "uuid";



// --- CORE TABLES ---

export const users = pgTable("users", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tenantsUsers = pgTable("tenants_users", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role", { length: 50 }).default("member").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("tenant_user_unique").on(t.tenantId, t.userId)]
);


export const premises = pgTable("premises", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  location: point("location", { mode: "xy" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  names: jsonb("names").$type<Record<string, string>>().notNull(),
});

export const containers = pgTable("containers", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  premiseId: uuid("premise_id").references(() => premises.id, { onDelete: "set null" }),
  embedding: vector("embedding", { dimensions: 768 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  className: varchar("class_name", { length: 50 }),
  isHidden: boolean("is_hidden").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  embedding: vector("embedding", { dimensions: 768 }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  className: varchar("class_name", { length: 50 }),
  isPinned: boolean("is_pinned").default(false).notNull(),
  isHidden: boolean("is_hidden").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const whereaboutsKindEnum = pgEnum("whereabouts_kind", ["missing", "not_set", "stored"]);

export const itemsWhereAbouts = pgTable("items_where_abouts", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }).notNull(),
  containerId: uuid("container_id").references(() => containers.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  locationDescription: text("location_description"),
  kind: whereaboutsKindEnum("kind").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  check(
    "whereabouts_not_both_set",
    sql`NOT (${table.userId} IS NOT NULL AND ${table.containerId} IS NOT NULL)`,
  ),
  check(
    "whereabouts_kind_matches_fields",
    sql`(
      (${table.kind} = 'stored' AND (
        ${table.containerId} IS NOT NULL OR
        ${table.userId} IS NOT NULL OR
        ${table.locationDescription} IS NOT NULL
      ))
      OR
      (${table.kind} IN ('missing', 'not_set') AND
        ${table.containerId} IS NULL AND
        ${table.userId} IS NULL AND
        ${table.locationDescription} IS NULL
      )
    )`,
  ),
]);


// --- AUTOMATION TABLES ---

export const scenarios = pgTable("scenarios", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cronExpression: varchar("cron_expression", { length: 100 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scenarioItems = pgTable("scenario_items", {
    scenarioId: uuid("scenario_id").references(() => scenarios.id, { onDelete: "cascade" }).notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.scenarioId, t.itemId] })]
);

// --- SYSTEM LOGS & EVENTS TABLE ---
export const events = pgTable("events", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),

  // ("ITEM_MARKED_MISSING", "USER_REGISTERED", "SCENARIO_TRIGGERED")
  eventType: varchar("event_type", { length: 255 }).notNull(),
  payload: jsonb("payload").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

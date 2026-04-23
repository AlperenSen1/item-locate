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
} from "drizzle-orm/pg-core";

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

// --- DOMAIN TABLES ---

export const containers = pgTable("containers", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  location: text("location"),
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
  category: varchar("category").default("Other").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  location: text("location"),
  className: varchar("class_name", { length: 50 }),
  isPinned: boolean("is_pinned").default(false).notNull(),
  isHidden: boolean("is_hidden").default(false).notNull(),
  status: varchar("status", { length: 50 }).default("not_set").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});


export const itemsWhereAbouts = pgTable("items_where_abouts", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  itemId: uuid("item_id").references(() => items.id, { onDelete: "cascade" }).notNull(),
  containerId: uuid("container_id").references(() => containers.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),

});


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

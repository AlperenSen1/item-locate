import { relations } from "drizzle-orm";
import {
  users,
  tenants,
  tenantsUsers,
  containers,
  items,
  itemsWhereAbouts,
  scenarios,
  scenarioItems,
  events,
  premises,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  tenantsUsers: many(tenantsUsers),
  itemsWhereAbouts: many(itemsWhereAbouts),
  events: many(events),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  tenantsUsers: many(tenantsUsers),
  containers: many(containers),
  items: many(items),
  scenarios: many(scenarios),
  events: many(events),
}));

export const tenantsUsersRelations = relations(tenantsUsers, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantsUsers.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [tenantsUsers.userId],
    references: [users.id],
  }),
}));

export const containersRelations = relations(containers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [containers.tenantId],
    references: [tenants.id],
  }),
  premise: one(premises, {
    fields: [containers.premiseId],
    references: [premises.id],
  }),
  itemsWhereAbouts: many(itemsWhereAbouts),
}));

export const premisesRelations = relations(premises, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [premises.tenantId],
    references: [tenants.id],
  }),
  containers: many(containers),
}))

export const itemsRelations = relations(items, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [items.tenantId],
    references: [tenants.id],
  }),
  itemsWhereAbouts: many(itemsWhereAbouts),
  scenarioItems: many(scenarioItems),
}));

export const itemsWhereAboutsRelations = relations(itemsWhereAbouts, ({ one }) => ({
  item: one(items, {
    fields: [itemsWhereAbouts.itemId],
    references: [items.id],
  }),
  container: one(containers, {
    fields: [itemsWhereAbouts.containerId],
    references: [containers.id],
  }),
  user: one(users, {
    fields: [itemsWhereAbouts.userId],
    references: [users.id],
  }),
}));

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [scenarios.tenantId],
    references: [tenants.id],
  }),
  scenarioItems: many(scenarioItems),
}));

export const scenarioItemsRelations = relations(scenarioItems, ({ one }) => ({
  scenario: one(scenarios, {
    fields: [scenarioItems.scenarioId],
    references: [scenarios.id],
  }),
  item: one(items, {
    fields: [scenarioItems.itemId],
    references: [items.id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [events.tenantId],
    references: [tenants.id],
  }),
}));

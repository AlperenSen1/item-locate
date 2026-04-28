# item-locate

A multi-tenant item tracking API built with Bun, Hono, Drizzle ORM, PostgreSQL, and Zod.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **ORM**: Drizzle
- **Database**: PostgreSQL
- **Validation**: Zod
- **Language**: TypeScript

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login and retrieve a JWT token |
| `POST` | `/auth/token/refresh` | Refresh JWT for a different tenant |
| `GET` | `/auth/me` | Get current user info |

#### `POST /auth/register`
Registers a new user. Hashes the provided password and creates a user, an empty default tenant, and an admin membership in a single transaction.

**Request Body**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}
```

#### `POST /auth/login`
Authenticates a user. If only `email` and `password` are provided, returns the user's tenant list. If `tenantId` is also provided, returns a signed JWT for that tenant.

**Request Body**
```json
{
  "email": "john@example.com",
  "password": "securepassword",
  "tenantId": "optional-tenant-uuid"
}
```

#### `POST /auth/token/refresh`
Returns a new JWT for the given `tenantId`. The user must be a member of that tenant.

**Request Body**
```json
{
  "tenantId": "tenant-uuid"
}
```

#### `GET /auth/me`
Returns the authenticated user's profile and active tenant info.

**Response**
```json
{
  "id": "user-uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "tenantName": "My Tenant",
  "role": "admin"
}
```

---

### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/tenants` | List all tenants the user belongs to |
| `POST` | `/tenants` | Create a new tenant |
| `POST` | `/tenants/users` | Add users to the active tenant (admin only) |
| `GET` | `/tenants/users` | List all members of the active tenant |
| `GET` | `/tenants/users/:userId` | Get a specific member's details (admin only) |

#### `GET /tenants`
Returns all tenants the authenticated user is a member of, including `id`, `name`, and `createdAt`.

#### `POST /tenants`
Creates a new tenant and automatically assigns the creator as an admin member.

**Request Body**
```json
{
  "name": "My New Tenant"
}
```

#### `POST /tenants/users`
Adds one or more users to the active tenant. Requires admin role.

**Request Body**
```json
{
  "users": [
    { "userId": "user-uuid-1", "role": "member" },
    { "userId": "user-uuid-2", "role": "admin" }
  ]
}
```

---

### Containers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/containers` | List all containers in the active tenant |
| `POST` | `/containers` | Create a new container |
| `GET` | `/containers/:id` | Get a specific container |
| `GET` | `/containers/:id/items` | List items inside a container |
| `POST` | `/containers/:id/items/:itemId` | Add an item to a container |

#### `POST /containers`
Creates a container linked to the active tenant.

**Request Body**
```json
{
  "name": "Kitchen Cabinet",
  "description": "optional",
  "location": "optional",
  "className": "optional-icon-name",
  "isHidden": false
}
```

#### `POST /containers/:id/items/:itemId`
Links an item to a container. Records the relationship in `itemsWhereAbouts` with `userId` set to `null` and updates the item's `status` to `"stored"`. Runs in a transaction.

---

### Items

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/items` | List all items in the active tenant |
| `POST` | `/items` | Create a new item |
| `GET` | `/items/:id` | Get a specific item |
| `GET` | `/items/:id/where` | Get the current location of an item |
| `POST` | `/items/:id/missing` | Mark an item as missing |
| `POST` | `/users/me/items/:id` | Claim an item (mark as with you) |

#### `POST /items`
Creates an item linked to the active tenant. The `status` field is automatically set to `"not_set"` and cannot be set by the user at creation time.

**Request Body**
```json
{
  "name": "Laptop",
  "category": "optional",
  "location": "optional",
  "className": "optional-icon-name",
  "isPinned": false,
  "isHidden": false
}
```

#### `GET /items/:id/where`
Returns the current location of an item by checking the latest record in `itemsWhereAbouts`.

| Scenario | Response |
|----------|----------|
| `containerId` is set, `userId` is null | Container details |
| `userId` is set, `containerId` is null | User details |
| Both are null | `{ "message": "missing" }` |
| No records exist | `404 Item history not found` |

#### `POST /items/:id/missing`
Marks an item as missing. In a single transaction, inserts a new `itemsWhereAbouts` row with both `containerId` and `userId` set to `null`, and updates `items.status` to `"missing"`.

#### `POST /users/me/items/:id`
Claims an item for the authenticated user. Inserts a new `itemsWhereAbouts` row with `containerId` set to `null` and `userId` set to the authenticated user's ID. Updates `items.status` to `"stored"`.

---

## Item Status

An item's `status` field can only hold the following values:

| Status | Meaning |
|--------|---------|
| `not_set` | Item has just been created, no location assigned |
| `stored` | Item is stored somewhere — either in a container or with a user |
| `missing` | Item has been marked as lost |

Status transitions happen automatically through the relevant endpoints and are never set directly by the user at creation time.

---

## Data Model Overview

```
users ──────────────── tenantsUsers ──────────────── tenants
                             │
                        containers
                             │
                    itemsWhereAbouts ──── items
```

- A **user** can belong to multiple **tenants** with different roles (`admin`, `member`).
- A **tenant** owns **containers** and **items**.
- **itemsWhereAbouts** tracks the location history of each item — whether it is in a container, with a specific user, or missing.

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | Start the development server with hot reload |
| `bun db:generate` | Generate Drizzle migration files |
| `bun db:migrate` | Apply migrations to the database |
| `bun install` | Install all dependencies across the monorepo |

---

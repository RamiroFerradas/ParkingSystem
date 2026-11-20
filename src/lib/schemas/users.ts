import { z } from "zod";

/**
 * Payload schemas for the user administration routes.
 *
 * Same contract as the rest of `src/lib/schemas`: the handlers read fields with
 * `typeof` and silently defaulted them, so a wrong JSON type degrades to "not
 * provided" instead of a validation failure. Roles are exposed through
 * {@link isRole} because the routes need to name the offending value.
 */

/** Roles accepted by the API; mirrors the `user_role` enum in the database. */
export const ROLES = ["admin", "supervisor", "employee"] as const;

export type Role = (typeof ROLES)[number];

const ROLE_SET: ReadonlySet<string> = new Set(ROLES);

/** Narrows an untrusted payload value to one of the known roles. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLE_SET.has(value);
}

/** Trimmed string; absence or any other JSON type counts as `""`. */
const trimmedOrEmpty = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string(),
);

/** Raw string; absence or any other JSON type counts as `""`. */
const stringOrEmpty = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string(),
);

/** String only when it really is one, otherwise "not provided". */
const optionalString = z.preprocess(
  (value) => (typeof value === "string" ? value : undefined),
  z.string().optional(),
);

/** `POST /api/users`. Normalization is kept; the rules stay in the route. */
export const createUserSchema = z.object({
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : ""),
    z.string(),
  ),
  fullName: trimmedOrEmpty,
  /** Left raw so the route can tell "missing" from "unknown role". */
  role: z.unknown().optional(),
  password: stringOrEmpty,
});

export type CreateUserPayload = z.infer<typeof createUserSchema>;

/** `PATCH /api/users/[id]`. Only the fields present are touched. */
export const updateUserSchema = z.object({
  /** Read as `isActive === false` and `Boolean(isActive)`, so it stays raw. */
  isActive: z.unknown().optional(),
  role: z.unknown().optional(),
  password: optionalString,
});

export type UpdateUserPayload = z.infer<typeof updateUserSchema>;

/** One override as it arrives: the route validates the permission and its value. */
export interface PermissionOverride {
  permission?: unknown;
  allowed?: unknown;
}

/** `PUT /api/users/[id]/permissions`. Items must be objects; contents are checked after. */
export const permissionOverridesSchema = z.object({
  overrides: z.array(
    z.custom<PermissionOverride>((value) => typeof value === "object" && value !== null),
  ),
});

export type PermissionOverridesPayload = z.infer<typeof permissionOverridesSchema>;

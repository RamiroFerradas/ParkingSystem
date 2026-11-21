/**
 * Accounts the e2e schema seeds. Dependency-free on purpose: this module is
 * imported both by the Node CLI that builds the schema (`.mjs`) and by the
 * Playwright setup project (`auth.setup.ts`).
 */
export const ADMIN = {
  email: "e2e-admin@parking.local",
  password: "e2e-Admin-2026!",
};

export const EMPLOYEE = {
  email: "e2e-employee@parking.local",
  password: "e2e-Employee-2026!",
};

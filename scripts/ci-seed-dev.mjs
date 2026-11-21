#!/usr/bin/env node
/**
 * Applies `tests/db/fixtures.sql` to the schema used by `tests/db/*`.
 *
 *   TS_SCHEMA=dev node scripts/ci-seed-dev.mjs
 *
 * The migrations create branches, floors, boxes and the tariff tables, but no
 * user. The DB tests need an active actor, so CI seeds one here instead of
 * touching production data.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = process.env.TEST_SCHEMA ?? "dev";

if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
  console.error(`Invalid schema name: ${schema}`);
  process.exit(1);
}
if (schema === "public") {
  console.error("Refusing to seed the public schema");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = readFileSync(join(ROOT, "tests", "db", "fixtures.sql"), "utf8");
const { Client } = await import("pg");
const client = new Client({
  connectionString,
  options: `-c search_path=${schema},public`,
});

await client.connect();
try {
  await client.query(sql);
  console.log(`fixtures aplicadas en ${schema}`);
} finally {
  await client.end();
}

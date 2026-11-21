#!/usr/bin/env node
/**
 * Applies `db/migrations` to one or more schemas. CI helper.
 *
 *   node scripts/ci-migrate.mjs public dev
 *
 * CI keeps two targets in the same throwaway Postgres:
 *   - `public` for the app and the HTTP/RPC smoke suites
 *   - `dev`    for `tests/db/*`, whose harness defaults to that schema
 *
 * Tracks applied files in `<schema>.schema_migrations` so a re-run is a no-op,
 * mirroring `scripts/migrate.sh`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "db", "migrations");

const schemas = process.argv.slice(2);
if (schemas.length === 0) {
  console.error("usage: node scripts/ci-migrate.mjs <schema...>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

for (const schema of schemas) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    console.error(`Invalid schema name: ${schema}`);
    process.exit(1);
  }
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const { Client } = await import("pg");

for (const schema of schemas) {
  const client = new Client({
    connectionString,
    // Startup packet, so it survives any pooler in front of the database.
    options: `-c search_path=${schema},public`,
  });
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS "${schema}".schema_migrations (
         filename   text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    for (const file of files) {
      const applied = await client.query(
        `SELECT 1 FROM "${schema}".schema_migrations WHERE filename = $1`,
        [file],
      );
      if (applied.rowCount > 0) continue;

      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query(`SET search_path TO "${schema}", public;\n${sql}`);
      await client.query(
        `INSERT INTO "${schema}".schema_migrations (filename) VALUES ($1)`,
        [file],
      );
      console.log(`[ci-migrate] ${schema}: applied ${file}`);
    }

    console.log(`[ci-migrate] ${schema}: up to date (${files.length} migrations)`);
  } finally {
    await client.end();
  }
}

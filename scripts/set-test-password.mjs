#!/usr/bin/env node
// Rota la clave de admin@parking.local en las 3 bases (solo testing).
// Uso: node scripts/set-test-password.mjs [password]
// Al terminar el test, rotar a una clave fuerte.
import { hash } from "@node-rs/argon2";
import { readFileSync } from "node:fs";
import { Client } from "pg";

const NEW_PASSWORD = process.argv[2] ?? "123456";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const targets = [
  ["local", process.env.DATABASE_URL ?? "postgres://parking:parking_dev@localhost:5433/parking", null],
  ["cloud public", env.SUPABASE_DB_URL, "public"],
  ["cloud dev", env.SUPABASE_DB_URL_DEV, "dev"],
];
const h = await hash(NEW_PASSWORD);
for (const [name, cs, schema] of targets) {
  if (!cs) {
    console.log(name + ": sin URL, salteado");
    continue;
  }
  const c = new Client({ connectionString: cs, ssl: cs.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  await c.connect();
  try {
    // El schema selecciona el ambiente de Supabase (public = prod, dev = pruebas).
    if (schema && schema !== "public") {
      if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error("schema inválido: " + schema);
      await c.query(`SET search_path TO "${schema}", public`);
    }
    const { rows: [u] } = await c.query("SELECT id FROM profiles WHERE email = 'admin@parking.local'");
    if (!u) {
      console.log(name + ": admin@parking.local no existe, salteado");
      continue;
    }
    await c.query(
      "UPDATE auth_credentials SET password_hash = $1, password_updated_at = now() WHERE user_id = $2",
      [h, u.id],
    );
    console.log(name + ": admin -> " + NEW_PASSWORD);
  } finally {
    await c.end();
  }
}

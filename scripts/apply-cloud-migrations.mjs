#!/usr/bin/env node
// Aplica las migraciones db/migrations/001..NNN en orden contra la DB cloud
// (Supabase) y habilita RLS deny-all en todas las tablas public.
//
// Uso: SUPABASE_DB_URL=postgres://... node scripts/apply-cloud-migrations.mjs
// No toca la DB local (DATABASE_URL) — dev sigue contra Postgres local.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const URL_CLOUD = process.env.SUPABASE_DB_URL;
if (!URL_CLOUD) {
  console.error("SUPABASE_DB_URL requerida (postgres://postgres.<ref>:<pw>@aws-0-us-east-2.pooler.supabase.com:5432/postgres)");
  process.exit(1);
}

const migrationsDir = join(process.cwd(), "db", "migrations");
const files = readdirSync(migrationsDir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();

const client = new Client({
  connectionString: URL_CLOUD,
  ssl: { rejectUnauthorized: false }, // cert del pooler Supabase: sin CA bundle en Node
});
await client.connect();

let failures = 0;
const ok = (name, cond, extra = "") => {
  if (cond) console.log(`✓ ${name}`);
  else { failures++; console.error(`✗ ${name} ${extra}`); }
};

try {
  // Tracking de migraciones aplicadas (idempotencia: re-corridas no re-aplican)
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const markExisting = process.env.MARK_EXISTING === "1"; // marca ya-aplicadas sin ejecutarlas
  for (const file of files) {
    const { rows: done } = await client.query(`SELECT 1 FROM schema_migrations WHERE filename = $1::text`, [file]);
    if (done.length > 0) {
      console.log(`• migración ${file} ya aplicada`);
      continue;
    }
    if (markExisting) {
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1::text) ON CONFLICT DO NOTHING`, [file]);
      console.log(`• migración ${file} marcada como aplicada (MARK_EXISTING)`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1::text) ON CONFLICT DO NOTHING`, [file]);
      console.log(`✓ migración ${file} aplicada`);
    } catch (err) {
      failures++;
      console.error(`✗ ${file} → ${err.message.split("\n")[0]}`);
      throw err;
    }
  }

  // RLS deny-all en todas las tablas public: la publishable key de Supabase es
  // pública y el Data API expondría las tablas. La app conecta como superuser
  // postgres (bypass RLS) y nunca usa el Data API → deny-all es puro blindaje.
  await client.query(`
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
    END $$;
  `);
  console.log("✓ RLS (deny-all, sin políticas) habilitado en todas las tablas public");

  // Verificación
  const tables = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const rls = await client.query(
    `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true`,
  );
  const rpcs = await client.query(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN
        ('open_session','close_session','quote_exit','calc_fee_breakdown')`,
  );
  const view = await client.query(`SELECT count(*)::int AS n FROM box_status`);
  const seed = await client.query(
    `SELECT (SELECT count(*) FROM vehicle_types) AS vt, (SELECT count(*) FROM payment_methods) AS pm,
            (SELECT count(*) FROM parking_tariffs) AS t, (SELECT count(*) FROM profiles) AS u`,
  );
  ok("tablas public creadas", tables.rows[0].n >= 15, `n=${tables.rows[0].n}`);
  ok("RLS activo en todas", rls.rows[0].n === tables.rows[0].n, `rls=${rls.rows[0].n} tables=${tables.rows[0].n}`);
  ok("RPCs presentes", rpcs.rows[0].n >= 4, `n=${rpcs.rows[0].n}`);
  ok("vista box_status accesible", typeof view.rows[0].n === "number");
  ok(
    "seed de catálogos",
    seed.rows[0].vt >= 5 && seed.rows[0].pm >= 5 && seed.rows[0].t >= 20,
    JSON.stringify(seed.rows[0]),
  );
  console.log(`  → sin usuarios en la nube (profiles=${seed.rows[0].u}): el primero se crea aparte`);
} finally {
  await client.end();
}
console.log(failures === 0 ? "\nCLOUD MIGRATIONS OK" : `\n${failures} FALLARON`);
process.exitCode = failures === 0 ? 0 : 1;

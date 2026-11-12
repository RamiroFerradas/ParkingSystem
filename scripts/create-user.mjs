#!/usr/bin/env node
// Alta de usuarios del sistema (solo desde el servidor, para bootstrap del admin).
// Uso: node scripts/create-user.mjs <email> <nombre> <rol> <contraseña>
import { Pool } from "pg";
import { hash } from "@node-rs/argon2";

const [email, name, role, password] = process.argv.slice(2);

if (!email || !name || !role || !password) {
  console.error("Uso: node scripts/create-user.mjs <email> <nombre> <rol admin|supervisor|employee> <contraseña>");
  process.exit(1);
}
if (!["admin", "supervisor", "employee"].includes(role)) {
  console.error("Rol inválido:", role);
  process.exit(1);
}
if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// DATABASE_SCHEMA (opcional, default public): ambiente destino por schema.
const schema = process.env.DATABASE_SCHEMA ?? "public";
if (schema !== "public") pool.on("connect", (c) => c.query(`SET search_path TO "${schema}", public`));

try {
  const passwordHash = await hash(password); // Argon2id (default @node-rs/argon2)
  const inserted = await pool.query(
    `INSERT INTO profiles (id, full_name, email, role)
     VALUES (gen_random_uuid(), $2, $1, $3)
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, is_active = true
     RETURNING id, full_name, email, role::text AS role`,
    [email.toLowerCase(), name, role],
  );
  const user = inserted.rows[0];
  await pool.query(
    `INSERT INTO auth_credentials (user_id, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, password_updated_at = now()`,
    [user.id, passwordHash],
  );
  console.log(`✓ Usuario ${user.email} (${user.role}) listo.`);
} finally {
  await pool.end();
}

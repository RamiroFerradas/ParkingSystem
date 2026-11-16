#!/usr/bin/env node
// Setea las env vars de producción en Vercel y muestra host (no secretos).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const authSecret = randomBytes(32).toString("base64url");
const vars = [
  ["DATABASE_URL", env.SUPABASE_DB_URL],
  ["AUTH_SECRET", authSecret],
  ["DATA_PLANE", "cloud"],
];

for (const [key, value] of vars) {
  execSync(`vercel env add ${key} production`, {
    stdio: ["pipe", "ignore", "inherit"],
    shell: true,
    input: value,
  });
  console.log(`set ${key} -> ${key === "DATABASE_URL" ? "@" + (value.split("@")[1] ?? "").split("/")[0] : key === "AUTH_SECRET" ? "(32B nuevo)" : value}`);
}

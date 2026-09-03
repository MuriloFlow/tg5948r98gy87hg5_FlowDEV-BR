#!/usr/bin/env node
/**
 * Aplica apenas sql/003_seed.sql (configurações padrão, modelos de mensagem e
 * a carteira de demonstração). É seguro rodar mais de uma vez: o bloco de
 * demonstração se auto-detecta e não duplica.
 *
 *   npm run db:seed
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectionString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("\n  SUPABASE_DB_URL não definida no .env.local.\n");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const sql = await readFile(path.join(root, "sql", "003_seed.sql"), "utf8");
  const result = await client.query(sql);
  console.log("\n  Seed aplicado.\n");
  if (Array.isArray(result)) {
    for (const notice of client.notices ?? []) console.log(`  ${notice.message}`);
  }
} catch (error) {
  console.error(`\n  Falhou: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

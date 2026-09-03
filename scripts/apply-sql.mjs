#!/usr/bin/env node
/**
 * Aplica os scripts SQL no Postgres do Supabase, em ordem.
 *
 *   npm run db:push            # 001 + 002
 *   npm run db:push -- --seed  # 001 + 002 + 003
 *
 * Requer SUPABASE_DB_URL no .env.local (Supabase → Settings → Database →
 * Connection string → URI, com a senha preenchida).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = ["001_schema.sql", "002_functions.sql", "004_storage.sql", "005_fix_min_uuid.sql"];
if (process.argv.includes("--seed")) FILES.push("003_seed.sql");

const connectionString = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "\n  SUPABASE_DB_URL não definida.\n" +
      "  Pegue em Supabase → Settings → Database → Connection string (URI)\n" +
      "  e adicione ao .env.local.\n"
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`\n  Conectado. Aplicando ${FILES.length} script(s).\n`);

  for (const file of FILES) {
    const sql = await readFile(path.join(root, "sql", file), "utf8");
    const started = Date.now();
    process.stdout.write(`  ${file} … `);
    await client.query(sql);
    console.log(`ok (${Date.now() - started}ms)`);
  }

  console.log("\n  Banco atualizado com sucesso.\n");
} catch (error) {
  console.error(`\n  Falhou: ${error.message}\n`);
  if (error.position) console.error(`  Posição no arquivo: ${error.position}\n`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

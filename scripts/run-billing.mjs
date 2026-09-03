#!/usr/bin/env node
/**
 * Dispara manualmente a rotina diária de faturamento — a mesma que a Vercel
 * chama pelo cron. Útil para testar em desenvolvimento.
 *
 *   npm run cron:billing
 *   npm run cron:billing -- https://flowdeskbrasil.vercel.app
 */
const base = (
  process.argv[2] ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

const secret = process.env.CRON_SECRET;

const response = await fetch(`${base}/api/cron/billing`, {
  method: "POST",
  headers: secret ? { Authorization: `Bearer ${secret}` } : {},
}).catch((error) => {
  console.error(`\n  Não foi possível chamar ${base}: ${error.message}\n`);
  process.exit(1);
});

const body = await response.text();
console.log(`\n  ${response.status} ${response.statusText}\n`);

try {
  console.dir(JSON.parse(body), { depth: 4 });
} catch {
  console.log(body);
}

console.log();
if (!response.ok) process.exitCode = 1;

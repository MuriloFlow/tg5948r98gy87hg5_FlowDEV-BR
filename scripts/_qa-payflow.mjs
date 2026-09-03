// TEMPORÁRIO — fluxo de cobrança de ponta a ponta contra o dev server. Remover ao final.
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const BASE = "http://localhost:3000";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const cookie = execFileSync(
  process.execPath,
  ["--env-file-if-exists=.env.local", "scripts/_qa.mjs", "login"],
  { encoding: "utf8" }
).trim();

async function action(op, payload) {
  const response = await fetch(`${BASE}/api/qa-temp`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ op, payload }),
  });
  const json = await response.json();
  return json;
}

function log(step, value) {
  console.log(`\n=== ${step} ===`);
  console.log(JSON.stringify(value, null, 2).slice(0, 1400));
}

const stamp = Date.now();

// 1. cliente
const customer = await action("customer", {
  type: "PJ",
  name: `QA Pagamentos ${stamp}`,
  legal_name: "QA Pagamentos LTDA",
  document: "11222333000181",
  email: `qa.pay.${stamp}@example.com`,
  status: "ACTIVE",
});
log("criar cliente", customer);
if (!customer.ok) process.exit(1);

// 2. projeto
const project = await action("project", {
  customer_id: customer.data.id,
  name: `QA Projeto ${stamp}`,
  slug: `qa-projeto-${stamp}`,
  color: "#635BFF",
  environment: "TEST",
  monthly_amount_cents: "19900",
  contract_value_cents: "0",
  block_mode: "AUTO",
  grace_days: "3",
});
log("criar projeto", project);
if (!project.ok) process.exit(1);

// 3. cobrança (deve gerar o payment link automaticamente)
const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const invoice = await action("invoice", {
  project_id: project.data.id,
  description: `Mensalidade QA ${stamp}`,
  amount: "199,00",
  discount_amount: "0",
  due_date: due,
  expires_days: "30",
  max_installments: "12",
  payment_methods: ["PIX", "CREDIT_CARD", "BOLETO"],
  is_mandatory: "on",
});
log("criar cobrança", invoice);
if (!invoice.ok) process.exit(1);

const links = await action("links-for-invoice", { id: invoice.data.id });
log("links da cobrança (auto)", links);

const link = links.data?.[0];
if (!link) {
  console.error("nenhum link gerado automaticamente");
  process.exit(1);
}

// 4. checkout público
const checkoutHtml = await fetch(`${BASE}/pay/${link.token}`);
console.log(`\n=== GET /pay/${link.token} -> ${checkoutHtml.status} ===`);
const html = await checkoutHtml.text();
for (const marker of ["Gerar QR Code Pix", "Pagar com cartão", "Gerar boleto", "Checkout temporariamente indisponível"]) {
  console.log(`  ${html.includes(marker) ? "presente" : "ausente "} :: ${marker}`);
}

// 5. Pix
const pixResponse = await fetch(`${BASE}/api/public/pay/${link.token}/pix`, { method: "POST" });
const pix = await pixResponse.json();
log(`POST /pix -> ${pixResponse.status}`, {
  ...pix,
  qr_code: pix.qr_code ? `${pix.qr_code.slice(0, 60)}… (${pix.qr_code.length} chars)` : null,
  qr_code_base64: pix.qr_code_base64 ? `base64 (${pix.qr_code_base64.length} chars)` : null,
});

// 6. status (polling)
const statusResponse = await fetch(`${BASE}/api/public/pay/${link.token}/status`);
log(`GET /status -> ${statusResponse.status}`, await statusResponse.json());

// 7. link avulso + regenerar + estender + desativar
const standalone = await action("link", {
  project_id: project.data.id,
  title: `Link avulso QA ${stamp}`,
  amount: "49,90",
  max_installments: "1",
  expires_days: "7",
  max_uses: "1",
  payment_methods: ["PIX"],
});
log("criar link avulso", standalone);

if (standalone.ok) {
  log("regenerar checkout", await action("regenerate", { id: standalone.data.id }));
  log("estender validade", await action("extend", { id: standalone.data.id, days: 15 }));
  log("desativar link", await action("disable", { id: standalone.data.id }));
}

// 8. estado final
const { data: finalInvoice } = await supabase
  .from("invoices")
  .select("id, code, status, total, paid_amount")
  .eq("id", invoice.data.id)
  .maybeSingle();
const { data: payments } = await supabase
  .from("payments")
  .select("id, method, status, provider_status, amount, pix_expires_at")
  .eq("payment_link_id", link.id);

log("estado final", { invoice: finalInvoice, payments });
console.log(
  `\ncontexto:\n  customer=${customer.data.id}\n  project=${project.data.id}\n  invoice=${invoice.data.id}\n  link=${link.id}\n  token=${link.token}\n  standalone=${standalone.data?.id ?? "-"}`
);

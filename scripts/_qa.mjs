// TEMPORÁRIO — harness de verificação. Remover ao final.
import { createClient } from "@supabase/supabase-js";
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const BASE = process.env.QA_BASE ?? "http://localhost:3000";
const EMAIL = "qa.temp.flowdesk@example.com";
const PASSWORD = "QaTemp!Flowdesk2026";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return ["scrypt", 16384, 8, 1, salt.toString("hex"), derived.toString("hex")].join("$");
}

async function createUser() {
  await cleanup(true);
  const { data, error } = await supabase
    .from("admin_users")
    .insert({
      name: "QA Temporário",
      email: EMAIL,
      password_hash: await hashPassword(PASSWORD),
      role: "OWNER",
      status: "ACTIVE",
    })
    .select("id, email, role")
    .single();
  if (error) throw new Error(error.message);
  console.log("usuário criado:", data);
}

async function cleanup(silent = false) {
  const { data: users } = await supabase.from("admin_users").select("id").eq("email", EMAIL);
  for (const u of users ?? []) {
    await supabase.from("admin_sessions").delete().eq("user_id", u.id);
    await supabase.from("audit_logs").delete().eq("actor_id", u.id);
    await supabase.from("admin_users").delete().eq("id", u.id);
  }
  if (!silent) console.log("removidos:", users?.length ?? 0, "usuário(s) de teste");
}

/** Login pelo caminho de progressive enhancement (mesmo POST que o browser faz sem JS). */
async function login() {
  const html = await (await fetch(`${BASE}/login`)).text();
  const form = html.match(/<form[\s\S]*?<\/form>/)?.[0];
  if (!form) throw new Error("formulário de login não encontrado");

  const body = new FormData();
  const inputs = form.matchAll(/<input[^>]*name="(\$ACTION[^"]*)"[^>]*?(?:value="([^"]*)")?\/>/g);
  for (const [, name, value] of inputs) {
    body.append(name, decodeEntities(value ?? ""));
  }
  body.append("email", EMAIL);
  body.append("password", PASSWORD);
  body.append("remember", "on");

  const response = await fetch(`${BASE}/login`, { method: "POST", body, redirect: "manual" });
  const cookie = (response.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("fd_session="));

  if (!cookie) {
    throw new Error(
      `login falhou (${response.status}); corpo: ${(await response.text()).slice(0, 400)}`
    );
  }
  console.log(cookie);
  return cookie;
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

const ERROR_MARKERS = [
  "Unhandled Runtime Error",
  "failed to slot onto its children",
  "Internal Server Error",
  "__next_error__",
  "Application error: a server-side exception",
];

async function crawl(cookie, routes) {
  const results = [];
  for (const route of routes) {
    const started = Date.now();
    let status = 0;
    let problems = [];
    try {
      const response = await fetch(`${BASE}${route}`, {
        headers: { cookie, "user-agent": "flowdesk-qa" },
        redirect: "manual",
      });
      status = response.status;
      const text = await response.text();
      problems = ERROR_MARKERS.filter((m) => text.includes(m));
      if (status === 307 || status === 302) {
        problems.push(`redirect -> ${response.headers.get("location")}`);
      }
    } catch (error) {
      problems = [`fetch falhou: ${error.message}`];
    }
    const ms = Date.now() - started;
    const ok = status === 200 && problems.length === 0;
    results.push({ route, status, ok, problems });
    console.log(`${ok ? "OK  " : "FALHA"} ${String(status).padEnd(4)} ${route} (${ms}ms)`);
    if (problems.length) console.log("      ", problems.join(" | "));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} rotas OK`);
  if (failed.length) process.exitCode = 1;
  return results;
}

const PANEL_ROUTES = [
  "/dashboard",
  "/tempo-real",
  "/clientes",
  "/empresas",
  "/projetos",
  "/cobrancas",
  "/assinaturas",
  "/links",
  "/pagamentos",
  "/inadimplencia",
  "/reembolsos",
  "/despesas",
  "/fluxo-caixa",
  "/cupons",
  "/credenciais",
  "/webhooks",
  "/eventos",
  "/logs-api",
  "/bloqueios",
  "/documentacao",
  "/relatorios",
  "/metricas",
  "/notificacoes",
  "/auditoria",
  "/equipe",
  "/gateways",
  "/modelos",
  "/configuracoes",
];

async function dynamicRoutes() {
  const [customers, projects, invoices, payments, subscriptions, companies, links] =
    await Promise.all([
      supabase.from("customers").select("id").limit(1),
      supabase.from("projects").select("id").limit(1),
      supabase.from("invoices").select("id").limit(1),
      supabase.from("payments").select("id").limit(1),
      supabase.from("subscriptions").select("id").limit(1),
      supabase.from("companies").select("id").limit(1),
      supabase.from("payment_links").select("id, token").limit(1),
    ]);

  const routes = [];
  const push = (prefix, res) => {
    const id = res.data?.[0]?.id;
    if (id) routes.push(`${prefix}/${id}`);
  };
  push("/clientes", customers);
  push("/projetos", projects);
  push("/cobrancas", invoices);
  push("/pagamentos", payments);
  push("/assinaturas", subscriptions);
  push("/empresas", companies);
  push("/links", links);
  const token = links.data?.[0]?.token;
  if (token) {
    routes.push(`/pay/${token}`, `/pay/${token}/sucesso`, `/pay/${token}/pendente`, `/pay/${token}/falha`);
  }
  return routes;
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "user":
    await createUser();
    break;
  case "login":
    await login();
    break;
  case "cleanup":
    await cleanup();
    break;
  case "routes":
    console.log([...PANEL_ROUTES, ...(await dynamicRoutes())].join("\n"));
    break;
  case "crawl": {
    const cookie = await login();
    const extra = args.length ? args : await dynamicRoutes();
    await crawl(cookie, [...PANEL_ROUTES, ...extra]);
    break;
  }
  case "sql": {
    const { data, error } = await supabase.rpc("noop");
    console.log(data, error);
    break;
  }
  default:
    console.log("uso: user | login | crawl | routes | cleanup");
}

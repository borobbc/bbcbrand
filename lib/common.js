// Общая логика магазина BBC BRAND для Cloudflare Pages Functions.
// Хранилище — база D1 (binding DB), одна таблица ключ → JSON.

export const COLORS = { black: ["Чёрный", "⚫"], red: ["Бордовый", "🔴"], white: ["Белый", "⚪"] };
export const ORDER = ["black", "red", "white"];
export const CURRENCY = "₴";
export const CONTACT = "@bbcbrand";

const DEFAULT = () => ({
  products: Object.fromEntries(ORDER.map((k) => [k, { status: "out", drop_at: null, price: null }])),
  payment: `Реквизиты для оплаты пришлёт менеджер в Telegram ${CONTACT}.\nНапиши номер заказа.`,
  seq: 0,
  orders: [],
});

async function ensure(env) {
  if (!env.DB) throw new Error("Нет базы D1: добавь binding DB в настройках проекта");
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)").run();
}

export async function getKey(env, k) {
  await ensure(env);
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first();
  return row ? JSON.parse(row.v) : null;
}

export async function setKey(env, k, value) {
  await ensure(env);
  await env.DB.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
    .bind(k, JSON.stringify(value)).run();
}

export async function load(env) {
  const d = DEFAULT();
  const s = await getKey(env, "state");
  if (!s) return d;
  return { ...d, ...s, products: { ...d.products, ...(s.products || {}) } };
}
export const save = (env, st) => setKey(env, "state", st);

export const now = () => Date.now();

export function eff(p) {
  if (p.drop_at && now() < p.drop_at) return "drop";
  if (p.drop_at && now() >= p.drop_at) return "in_stock";
  return p.status === "in_stock" ? "in_stock" : "out";
}

export function publicState(st) {
  const products = {};
  for (const k of ORDER) {
    const p = st.products[k], e = eff(p);
    products[k] = { status: e === "drop" ? "out" : e, drop_at: e === "drop" ? p.drop_at : null, price: p.price ?? null };
  }
  return { now: now(), currency: CURRENCY, contact: CONTACT, payment: st.payment, products };
}

export const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, x-admin-secret" };

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS },
  });

export const priceTxt = (p) => (p.price ? `${String(p.price).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${CURRENCY}` : "не задана");

const h = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtDt = (ms) =>
  new Date(ms).toLocaleString("ru-RU", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const ORDER_ST = { new: "🆕 новый", paid: "💸 оплачен", sent: "📦 отправлен", cancel: "❌ отменён" };

export function orderText(o) {
  const t = [
    `🧾 <b>Заказ ${h(o.id)}</b> · ${ORDER_ST[o.status] || o.status}`,
    `${COLORS[o.color][1]} Картхолдер — ${COLORS[o.color][0]} · ${h(o.price_txt)}`,
    "",
    `👤 ${h(o.last_name)} ${h(o.first_name)}`,
    `📞 <code>${h(o.phone)}</code>`,
    `🏙 ${h(o.city)}`,
    `📮 НП: ${h(o.np)}`,
  ];
  if (o.telegram) t.push(`✈️ ${h(o.telegram)}`);
  if (o.comment) t.push(`💬 ${h(o.comment)}`);
  if (o.ttn) t.push(`🚚 ТТН: <code>${h(o.ttn)}</code>`);
  t.push(`\n🕒 ${fmtDt(o.created)}`);
  return t.join("\n");
}

export function orderKeyboard(o) {
  const rows = [];
  if (o.status === "new") rows.push([{ text: "💸 Оплачен", callback_data: `os:${o.id}:paid` }]);
  if (o.status === "new" || o.status === "paid") rows.push([{ text: "📦 Отправлен + ТТН", callback_data: `ot:${o.id}` }]);
  if (o.status !== "cancel") rows.push([{ text: "❌ Отменить", callback_data: `os:${o.id}:cancel` }]);
  return { inline_keyboard: rows };
}

export async function tg(env, method, params) {
  if (!env.BOT_TOKEN) return { ok: false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

export const adminIds = (env) => String(env.ADMIN_IDS || "").match(/-?\d+/g) || [];

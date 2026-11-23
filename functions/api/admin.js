import { load, save, json, CORS, now, loadTags, saveTags, newCode, normCode, COLORS } from "../../lib/common.js";

// Пульт для бота: наличие, таймеры, цены, реквизиты и статусы заказов.
export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SECRET || request.headers.get("x-admin-secret") !== env.ADMIN_SECRET) return json({ error: "forbidden" }, 403);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }

  try {
    if (String(b.action || "").startsWith("tag")) return await tagAction(env, b);
    const st = await load(env);
    let changed = false;

    if (b.action === "product") {
      const p = st.products[b.color];
      if (!p) return json({ error: "bad color" }, 400);
      if (b.status === "in" || b.status === "out") { p.status = b.status === "in" ? "in_stock" : "out"; p.drop_at = null; }
      if ("drop_at" in b) { p.drop_at = b.drop_at ? Number(b.drop_at) : null; if (p.drop_at) p.status = "out"; }
      if ("price" in b) p.price = b.price ? Math.max(0, parseInt(b.price, 10)) || null : null;
      changed = true;
    } else if (b.action === "payment") {
      st.payment = String(b.text || "").slice(0, 1500);
      changed = true;
    } else if (b.action === "order") {
      const o = (st.orders || []).find((x) => x.id === b.id);
      if (!o) return json({ error: "order not found" }, 404);
      if (b.status) o.status = b.status;
      if (b.status === "paid") { o.pay = "ok"; o.paid_at = now(); }
      if (b.status === "sent") { if (!o.pay || o.pay === "review") o.pay = "ok"; o.sent_at = now(); }
      if (["ok", "bad", "review"].includes(b.pay)) { o.pay = b.pay; if (b.pay === "ok") { o.paid_at = now(); if (o.status === "new") o.status = "paid"; } }
      if (b.ttn) o.ttn = String(b.ttn).slice(0, 40);
      changed = true;
    } else if (b.action !== "get") {
      return json({ error: "unknown action" }, 400);
    }

    if (changed) await save(env, st);
    return json({ ok: true, now: now(), state: st });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

// NFC-метки: создать, список, сменить цвет, сбросить проверки, удалить, тираж
async function tagAction(env, b) {
  const tags = await loadTags(env);
  const code = normCode(b.code);
  const t = code ? tags.items[code] : null;
  let tag = null;
  if (b.action === "tag_new") {
    if (!COLORS[b.color]) return json({ error: "bad color" }, 400);
    const c = newCode(tags.items);
    tags.seq += 1;
    tags.items[c] = { n: tags.seq, color: b.color, created: now(), first_scan: null, last_scan: null, scans: 0 };
    tag = { code: c, ...tags.items[c] };
  } else if (b.action === "tag_total") {
    tags.total = Math.max(1, Math.min(100000, parseInt(b.total, 10) || 500));
  } else if (["tag_color", "tag_reset", "tag_del", "tag_get"].includes(b.action)) {
    if (!t) return json({ error: "tag not found" }, 404);
    if (b.action === "tag_color") {
      if (!COLORS[b.color]) return json({ error: "bad color" }, 400);
      t.color = b.color;
    }
    if (b.action === "tag_reset") { t.first_scan = null; t.last_scan = null; t.scans = 0; }
    if (b.action === "tag_del") delete tags.items[code];
    else tag = { code, ...t };
  } else if (b.action !== "tags") {
    return json({ error: "unknown action" }, 400);
  }
  if (!["tags", "tag_get"].includes(b.action)) await saveTags(env, tags);
  const list = Object.entries(tags.items).map(([code, v]) => ({ code, ...v })).sort((a, z) => z.n - a.n);
  return json({ ok: true, now: now(), tag, tags: { seq: tags.seq, total: tags.total, count: list.length, items: list } });
}

import { load, save, json, CORS, now } from "../../lib/common.js";

// Пульт для бота: наличие, таймеры, цены, реквизиты и статусы заказов.
export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SECRET || request.headers.get("x-admin-secret") !== env.ADMIN_SECRET) return json({ error: "forbidden" }, 403);
  let b;
  try { b = await request.json(); } catch (e) { return json({ error: "bad json" }, 400); }

  try {
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

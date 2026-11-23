import { load, json, CORS, orderPublic } from "../../lib/common.js";

// Статус заказа для покупателя: /api/track?id=BBC-0001&t=TOKEN (можно несколько: id=A,B&t=x,y)
export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const ids = String(u.searchParams.get("id") || "").split(",").slice(0, 10);
  const ts = String(u.searchParams.get("t") || "").split(",");
  try {
    const st = await load(env);
    const out = ids.map((id, i) => {
      const o = (st.orders || []).find((x) => x.id === id);
      if (!o || !o.token || o.token !== ts[i]) return { id, missing: true };
      return orderPublic(o);
    });
    return json({ ok: true, orders: out });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

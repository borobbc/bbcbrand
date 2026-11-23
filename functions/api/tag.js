import { json, CORS, now, loadTags, saveTags, normCode, tagPublic, tg, adminIds, COLORS, fmtCode } from "../../lib/common.js";

// Публичная проверка NFC-метки: /api/tag?c=CODE
export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const code = normCode(url.searchParams.get("c"));
  if (!code) return json({ ok: false, error: "no code" }, 400);
  try {
    const tags = await loadTags(env);
    const t = tags.items[code];
    if (!t) return json({ ok: false, error: "not found" }, 404);
    const first = !t.first_scan;
    if (url.searchParams.get("peek") !== "1") {
      if (first) t.first_scan = now();
      t.last_scan = now();
      t.scans = (t.scans || 0) + 1;
      await saveTags(env, tags);
      if (first) {
        const c = COLORS[t.color] || ["", "🏷"];
        const text = `🏷 Метку <b>№${String(t.n).padStart(3, "0")}</b> · ${c[1]} ${c[0]} проверили впервые\nКод: <code>${fmtCode(code)}</code>`;
        const jobs = adminIds(env).map((id) => tg(env, "sendMessage", { chat_id: id, text, parse_mode: "HTML" }));
        if (waitUntil) waitUntil(Promise.all(jobs));
      }
    }
    return json(tagPublic(code, t, tags.total));
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 500);
  }
}

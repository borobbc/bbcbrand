import { load, save, getKey, setKey, eff, publicState, json, CORS, priceTxt, COLORS, tg, adminIds, orderText, orderKeyboard, now } from "../../lib/common.js";

const clean = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function rateOk(env, ip) {
  const key = "rate/" + String(ip || "x").replace(/[^a-zA-Z0-9.:_-]/g, "_");
  const list = ((await getKey(env, key)) || []).filter((t) => now() - t < 600000);
  if (list.length >= 5) return false;
  list.push(now());
  await setKey(env, key, list);
  return true;
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export async function onRequestPost({ request, env }) {
  let d;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json({ error: "Слишком большой запрос" }, 413);
    d = JSON.parse(raw || "{}");
  } catch (e) {
    return json({ error: "Неверный запрос" }, 400);
  }
  const o = {
    color: d.color,
    last_name: clean(d.last_name, 60), first_name: clean(d.first_name, 60),
    phone: clean(d.phone, 20), city: clean(d.city, 80),
    telegram: clean(d.telegram, 40), comment: clean(d.comment, 300),
    delivery: d.delivery === "eu" ? "eu" : "ua",
  };
  if (o.delivery === "eu") {
    o.country = clean(d.country, 60); o.zip = clean(d.zip, 12); o.address = clean(d.address, 160);
  } else {
    o.np = clean(d.np, 60);
  }
  o.prepay = o.delivery === "eu" ? 390 : 150;
  if (!COLORS[o.color]) return json({ error: "Неизвестный цвет" }, 400);
  const need = o.delivery === "eu"
    ? [["last_name", "фамилию"], ["first_name", "имя"], ["country", "страну"], ["city", "город"], ["zip", "индекс"], ["address", "адрес"]]
    : [["last_name", "фамилию"], ["first_name", "имя"], ["city", "город"], ["np", "отделение НП"]];
  for (const [f, nm] of need) if (!o[f]) return json({ error: `Укажи ${nm}` }, 400);
  const digits = o.phone.replace(/\D/g, "");
  if (digits.length < (o.delivery === "eu" ? 8 : 10) || digits.length > 15) return json({ error: "Проверь номер телефона" }, 400);

  try {
    const st = await load(env);
    const p = st.products[o.color];
    if (eff(p) !== "in_stock") return json({ error: "Этот цвет сейчас недоступен для заказа", state: publicState(st) }, 409);
    if (!(await rateOk(env, request.headers.get("CF-Connecting-IP"))))
      return json({ error: "Слишком много заказов подряд. Попробуй позже или напиши нам в Telegram." }, 429);

    st.seq = (st.seq || 0) + 1;
    o.id = `BBC-${String(st.seq).padStart(4, "0")}`;
    o.status = "new"; o.created = now(); o.price = p.price ?? null; o.price_txt = priceTxt(p);
    st.orders = [...(st.orders || []), o].slice(-500);
    await save(env, st);

    await Promise.all(adminIds(env).map((id) =>
      tg(env, "sendMessage", { chat_id: id, text: "🔔 Новый заказ с сайта!\n\n" + orderText(o), parse_mode: "HTML", reply_markup: orderKeyboard(o) })
    ));
    return json({ ok: true, id: o.id, delivery: o.delivery, prepay: o.prepay, payment: st.payment });
  } catch (e) {
    return json({ error: "Ошибка сервера. Попробуй ещё раз или напиши нам в Telegram." }, 500);
  }
}

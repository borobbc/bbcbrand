import { load, save, json, CORS, now, tgForm, tg, adminIds, orderText, orderKeyboard, orderPublic } from "../../lib/common.js";

// Покупатель прикрепляет скрин предоплаты прямо на сайте → он приходит админам в бот.
export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

const MAX = 10 * 1024 * 1024;
const PHOTO = ["image/jpeg", "image/png", "image/webp"];

export async function onRequestPost({ request, env }) {
  let form;
  try { form = await request.formData(); } catch (e) { return json({ error: "Неверный запрос" }, 400); }
  const id = String(form.get("id") || ""), token = String(form.get("t") || ""), file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Прикрепи файл" }, 400);
  if (file.size > MAX) return json({ error: "Файл больше 10 МБ" }, 413);
  const type = file.type || "";
  if (!type.startsWith("image/") && type !== "application/pdf") return json({ error: "Нужен скрин (фото) или PDF" }, 415);

  try {
    const st = await load(env);
    const o = (st.orders || []).find((x) => x.id === id);
    if (!o || !o.token || o.token !== token) return json({ error: "Заказ не найден" }, 404);
    if (o.status === "cancel") return json({ error: "Заказ отменён" }, 409);
    if ((o.receipts || 0) >= 5) return json({ error: "Слишком много файлов. Напиши нам в Telegram @bbcbrand" }, 429);

    const caption = "🧾 <b>Скрин предоплаты с сайта</b>\n\n" + orderText({ ...o, pay: "review" });
    const name = (file.name || "receipt").replace(/[^\w.\-]/g, "_").slice(0, 60) || "receipt";
    const asPhoto = PHOTO.includes(type) && file.size <= MAX;
    let sent = 0;
    for (const chat of adminIds(env)) {
      const base = { chat_id: chat, caption: caption.slice(0, 1024), parse_mode: "HTML", reply_markup: orderKeyboard(o) };
      let r = asPhoto ? await tgForm(env, "sendPhoto", { ...base, photo: [file, name] }) : { ok: false };
      if (!r.ok) r = await tgForm(env, "sendDocument", { ...base, document: [file, name] });
      if (r.ok) sent++;
    }
    if (!sent && adminIds(env).length && env.BOT_TOKEN) return json({ error: "Не получилось отправить скрин. Попробуй ещё раз или напиши в Telegram." }, 502);

    o.pay = "review"; o.receipt_at = now(); o.receipts = (o.receipts || 0) + 1;
    await save(env, st);
    return json({ ok: true, order: orderPublic(o) });
  } catch (e) {
    return json({ error: "Ошибка сервера. Попробуй ещё раз." }, 500);
  }
}

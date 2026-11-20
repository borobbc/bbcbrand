import { load, publicState, json } from "../../lib/common.js";

export async function onRequestGet({ env }) {
  try {
    return json(publicState(await load(env)));
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

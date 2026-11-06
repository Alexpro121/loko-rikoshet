// Мінімальний клієнт Bot API без бібліотек: fetch з тайм-аутом, одна повторна спроба після 429.
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

export class TgError extends Error {
  constructor(method, code, description) { super(`${method}: ${code} ${description}`); this.code = code; this.description = String(description || ''); }
}

/** Метод, якого цей сервер Bot API не знає (старіший за 10.4): віджети тоді вимикаються. */
export const isUnknownMethod = (e) => e instanceof TgError && e.code === 404;
/** Зміна, що нічого не міняє: для Telegram це помилка, для нас уже зроблено. */
export const isNotModified = (e) => e instanceof TgError && /not modified/i.test(e.description);

export function createApi(token, base = 'https://api.telegram.org', wait = 15000) {
  const root = `${base.replace(/\/+$/, '')}/bot${token}/`;
  async function call(method, params = {}, retry = true) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), method === 'getUpdates' ? wait + 40000 : wait);
    let body, headers;
    if (params instanceof FormData) body = params;
    else { body = JSON.stringify(params); headers = { 'Content-Type': 'application/json' }; }
    let r;
    try { r = await fetch(root + method, { method: 'POST', body, headers, signal: ctl.signal }); } finally { clearTimeout(t); }
    const j = await r.json().catch(() => ({ ok: false, error_code: r.status, description: r.statusText }));
    if (j.ok) return j.result;
    const after = j.parameters && j.parameters.retry_after;
    if (j.error_code === 429 && retry && after && after <= 10) {
      await new Promise((res) => setTimeout(res, after * 1000));
      return call(method, params, false);
    }
    throw new TgError(method, j.error_code, j.description);
  }
  /** Надіслати файл з диска (multipart): перший раз, далі за file_id. */
  call.upload = async (method, field, file, params = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(params)) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    fd.append(field, new Blob([await readFile(file)]), basename(file));
    return call(method, fd);
  };
  return call;
}

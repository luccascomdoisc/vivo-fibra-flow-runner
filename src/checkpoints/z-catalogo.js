import { CATALOG_URL, CADASTRO_BASE } from '../lib/constants.js';

/**
 * Checkpoint Z (sem browser): valida a disponibilidade do catalogo de planos.
 * A LP (internet.vivo.com.br) busca os planos nesse JSON; se ele responde 200 com
 * cards, a camada de oferta esta no ar. Tambem resolve a URL de entrada do cadastro.
 *
 * Retorna { result, entryUrl }.
 */
export async function runZ({ entry, config }) {
  const start = Date.now();
  const timeout = Math.min(config.timeoutPorStepMs, 15000);

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(CATALOG_URL, {
      headers: { accept: '*/*', referer: 'https://internet.vivo.com.br/' },
      signal: controller.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      return {
        result: result('fail', start, `total.json HTTP ${res.status}`),
        entryUrl: null,
      };
    }

    const data = await res.json();
    const cards = data?.cards ?? data?.response?.cards ?? [];
    if (!Array.isArray(cards) || cards.length < 1) {
      return { result: result('fail', start, 'catalogo sem cards'), entryUrl: null };
    }

    return {
      result: result('ok', start, `${cards.length} cards`),
      entryUrl: buildEntryUrl(entry, cards),
    };
  } catch (e) {
    return { result: result('fail', start, `erro fetch: ${e.message}`), entryUrl: null };
  }
}

function buildEntryUrl(entry, cards) {
  const pid = entry?.productsIds;
  const promo = entry?.promotion;
  if (pid && promo) {
    return `${CADASTRO_BASE}?productsIds=${pid}&promotion=${promo}&id_origem_vivo=TaticoLP&origin=TaticoLP`;
  }
  // Self-healing: usa a link.href de um card do catalogo.
  const href = cards.find((c) => c?.link?.href)?.link?.href;
  return href || `${CADASTRO_BASE}?productsIds=235&promotion=600&id_origem_vivo=TaticoLP&origin=TaticoLP`;
}

function result(status, start, detalhe) {
  return { status, durationMs: Date.now() - start, screenshotUrl: null, detalhe };
}

import { BFF_PREFIX } from './constants.js';

/**
 * Anexa um listener de network para capturar as respostas transacionais do BFF Vivo.
 * - /asb: indexado por SubType (lido do corpo JSON do request). Guarda status HTTP,
 *   status interno (body.response.status) e o campo result ("112|leadId|INVALIDO|ms").
 * - /topaz: guarda status HTTP e score.
 *
 * Uso: validacao secundaria dos checkpoints e extracao do leadId no SubType=10.
 */
export function attachNetworkCapture(page) {
  const asb = new Map();
  let topaz = null;
  // Ring buffer de chamadas de API *.vivo.com.br (fluxo novo: BFF ainda nao confirmado).
  // Vai para debug.apiCalls e serve para calibrar leadId/validacoes nas primeiras runs.
  const apiCalls = [];

  page.on('response', async (response) => {
    const url = response.url();

    // Captura generica (fluxo novo): XHR/fetch de API em dominios Vivo, sem corpo
    // (so metadados) para nao inflar o output nem vazar dados pessoais.
    try {
      const req = response.request();
      const tipo = req.resourceType();
      // Filtra pixels de ads/analytics: eles carregam ".vivo.com.br" nos params
      // (u1=, oref=) e inundavam o buffer, escondendo o BFF transacional real.
      const HOST_ADS = /(doubleclick|google|googletagmanager|google-analytics|facebook|tiktok|hotjar|clarity)\./i;
      const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
      if ((tipo === 'xhr' || tipo === 'fetch') && /\.vivo\.com\.br$/.test(host) && !HOST_ADS.test(host)) {
        apiCalls.push({
          method: req.method(),
          url: url.split('?')[0],
          status: response.status(),
          ts: Date.now(),
        });
        if (apiCalls.length > 60) apiCalls.shift();
      }
    } catch {
      /* nunca derruba o fluxo por captura */
    }

    if (!url.includes(BFF_PREFIX)) return;

    try {
      if (url.includes(`${BFF_PREFIX}asb`)) {
        let subType = null;
        const post = response.request().postData();
        if (post) {
          try {
            subType = String(JSON.parse(post).SubType);
          } catch {
            const m = post.match(/"?SubType"?\s*[:=]\s*"?(\d+)"?/);
            subType = m ? m[1] : null;
          }
        }
        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        if (subType && subType !== 'null') {
          asb.set(subType, {
            status: response.status(),
            innerStatus: body?.response?.status ?? null,
            result: body?.response?.result ?? null,
            body,
          });
        }
      } else if (url.includes(`${BFF_PREFIX}topaz`)) {
        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        topaz = { status: response.status(), score: body?.score ?? null, body };
      }
    } catch {
      /* nunca derruba o fluxo por causa de captura de network */
    }
  });

  return {
    getAsb: (subType) => asb.get(String(subType)) ?? null,
    getTopaz: () => topaz,
    getApiCalls: () => [...apiCalls],
  };
}

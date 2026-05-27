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

  page.on('response', async (response) => {
    const url = response.url();
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
  };
}

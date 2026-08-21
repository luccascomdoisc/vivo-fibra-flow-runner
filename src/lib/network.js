import {
  BFF_PREFIX,
  TATICO_API_MARKER,
  VIACEP_MARKER,
  FERIADOS_MARKER,
  HOSTS_API_EXTRA,
} from './constants.js';

/**
 * Anexa um listener passivo de network. O Actor NUNCA chama o backend por conta
 * propria (isso quebraria a coerencia de fingerprint que vence o Akamai): ele
 * apenas escuta o que a propria pagina pede.
 *
 * INFINITY (loja.vivo.com.br):
 *  - /asb   -> indexado por SubType. result = "112|leadId|INVALIDO|ms".
 *  - /topaz -> status + score.
 *
 * TATICO (internet.vivo.com.br/checkouts/fibra):
 *  - asbb2c.accenture.com/api -> mesmo padrao pipe-separado, novo host:
 *      auth:  {"response":{"status":200,"result":{"token":"<jwt>"}}}   (token NAO e guardado)
 *      lead:  {"response":{"status":200,"result":"102|64044654|DUPLICADO| 0.027"}}
 *  - viacep.com.br/ws/<cep>/json -> autofill de endereco (dependencia de terceiro).
 *  - brasilapi.com.br/api/feriados -> datas de agendamento (dependencia de terceiro).
 *
 * As duas ultimas existem para o alerta poder dizer "dependencia externa caiu"
 * em vez de "funil da Vivo quebrou".
 */
export function attachNetworkCapture(page) {
  const asb = new Map();
  let topaz = null;
  const apiCalls = [];
  // Tatico
  const tatico = []; // [{ status, innerStatus, codigo, leadId, marcador, ms }]
  let viacep = null; // { status, cep, logradouro, bairro, cidade, uf, temLogradouro }
  let feriados = null; // { status }

  page.on('response', async (response) => {
    const url = response.url();

    // Buffer generico de chamadas de API (metadados only, sem corpo): dominios Vivo
    // + os hosts de backend/terceiro do Tatico. Pixels de ads/analytics ficam de
    // fora porque carregavam ".vivo.com.br" nos params e inundavam o buffer.
    try {
      const req = response.request();
      const tipo = req.resourceType();
      const HOST_ADS = /(doubleclick|google|googletagmanager|google-analytics|facebook|tiktok|hotjar|clarity)\./i;
      const host = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return '';
        }
      })();
      const interessa = (/\.vivo\.com\.br$/.test(host) && !HOST_ADS.test(host)) || HOSTS_API_EXTRA.test(host);
      if ((tipo === 'xhr' || tipo === 'fetch') && interessa) {
        apiCalls.push({ method: req.method(), url: url.split('?')[0], status: response.status(), ts: Date.now() });
        if (apiCalls.length > 60) apiCalls.shift();
      }
    } catch {
      /* nunca derruba o fluxo por captura */
    }

    // ---- Tatico: backend transacional ----
    if (url.includes(TATICO_API_MARKER)) {
      try {
        const body = await response.json().catch(() => null);
        const result = body?.response?.result;
        // Auth: result e um objeto { token }. Nao guardamos o JWT.
        if (result && typeof result === 'object') {
          tatico.push({ status: response.status(), innerStatus: body?.response?.status ?? null, tipo: 'auth' });
        } else if (typeof result === 'string') {
          // "102|64044654|DUPLICADO| 0.027161121368408"
          const [codigo, leadId, marcador, ms] = result.split('|').map((s) => String(s).trim());
          tatico.push({
            status: response.status(),
            innerStatus: body?.response?.status ?? null,
            tipo: 'lead',
            codigo: codigo ?? null,
            leadId: /^\d+$/.test(leadId ?? '') ? leadId : null,
            marcador: marcador ?? null,
            ms: ms ?? null,
          });
        } else {
          tatico.push({ status: response.status(), innerStatus: body?.response?.status ?? null, tipo: 'outro' });
        }
        if (tatico.length > 20) tatico.shift();
      } catch {
        /* melhor-esforco */
      }
      return;
    }

    // ---- Tatico: dependencias de terceiro ----
    if (url.includes(VIACEP_MARKER)) {
      try {
        const body = await response.json().catch(() => null);
        viacep = {
          status: response.status(),
          cep: body?.cep ?? null,
          logradouro: body?.logradouro ?? null,
          bairro: body?.bairro ?? null,
          cidade: body?.localidade ?? null,
          uf: body?.uf ?? null,
          erro: body?.erro ?? null,
          // CEP "geral" de cidade pequena responde 200 com logradouro vazio: o
          // autofill vem em branco e o form da Vivo trava em Campo obrigatorio.
          temLogradouro: !!String(body?.logradouro ?? '').trim(),
        };
      } catch {
        viacep = { status: response.status(), temLogradouro: false };
      }
      return;
    }

    if (url.includes(FERIADOS_MARKER)) {
      feriados = { status: response.status() };
      return;
    }

    // ---- Infinity: BFF transacional ----
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
    // Tatico
    getTatico: () => [...tatico],
    /** Ultima resposta de lead do backend Tatico (a mais recente vence). */
    getTaticoLead: () => [...tatico].reverse().find((t) => t.tipo === 'lead') ?? null,
    getViaCep: () => viacep,
    getFeriados: () => feriados,
  };
}

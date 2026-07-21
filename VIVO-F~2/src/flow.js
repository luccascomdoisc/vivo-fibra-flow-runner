import { log } from 'apify';
import { emptyResults, buildOutput } from './lib/report.js';
import { launchBrowser, warmUpAkamai } from './lib/browser.js';
import { attachNetworkCapture } from './lib/network.js';
import { captureFailureContext } from './lib/screenshot.js';
import { runZ } from './checkpoints/z-catalogo.js';
import { runA } from './checkpoints/a-cadastro.js';
import { runB } from './checkpoints/b-dados.js';
import { runC } from './checkpoints/c-endereco.js';
import { runD } from './checkpoints/d-topaz.js';
import { runE } from './checkpoints/e-agendamento.js';
import { runF } from './checkpoints/f-confirmacao.js';
import { navigateAndDetect } from './lib/flowdetect.js';
import { runA_novo } from './checkpoints/novo/a-dados-pessoais.js';
import { runB_novo } from './checkpoints/novo/b-cep-endereco.js';
import { runC_novo } from './checkpoints/novo/c-imovel-avanco.js';
import { runE_novo } from './checkpoints/novo/e-agendamento.js';
import { runF_novo } from './checkpoints/novo/f-confirmacao.js';

/**
 * Orquestra Z->F. Para no primeiro checkpoint 'fail' (os seguintes ficam 'skipped').
 * Z e HTTP puro; se falhar, faz short-circuit e nem abre o browser.
 * Sempre retorna um ActorOutput (mesmo em excecao inesperada).
 */
export async function runFlow(input) {
  const runStartedAt = new Date().toISOString();
  const scenario = input.scenario;
  const entry = input.entry ?? {};
  const config = {
    timeoutPorStepMs: input.config?.timeoutPorStepMs ?? 30000,
    capturarScreenshots: input.config?.capturarScreenshots ?? true,
    headless: input.config?.headless ?? true,
    proxyMode: input.config?.proxyMode ?? 'none',
    warmup: input.config?.warmup ?? true,
  };

  const results = emptyResults();
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const state = {
    leadId: null,
    orderNumber: null,
    topazScore: null,
    error: null,
    debug: { proxyMode: config.proxyMode, userAgent: null, warmup: null, flow: null },
  };

  // ---- Checkpoint Z (HTTP, sem browser) ----
  const z = await runZ({ entry, config });
  Object.assign(byId.Z, z.result);
  log.info(`Checkpoint Z: ${z.result.status} (${z.result.durationMs}ms) ${z.result.detalhe ?? ''}`);
  if (z.result.status === 'fail') {
    state.error = `Catalogo indisponivel: ${z.result.detalhe}`;
    return buildOutput({ runStartedAt, results, ...state, scenario });
  }

  // ---- Browser: A..F ----
  let browser;
  try {
    const launched = await launchBrowser({ headless: config.headless, proxyMode: config.proxyMode });
    browser = launched.browser;
    const { page } = launched;
    const net = attachNetworkCapture(page);

    state.debug.userAgent = await page.evaluate(() => navigator.userAgent).catch(() => null);

    // Warm-up anti-Akamai antes de tocar no deep-link de cadastro (ver browser.js).
    if (config.warmup) state.debug.warmup = await warmUpAkamai(page, { timeout: config.timeoutPorStepMs });

    // Navega e detecta qual fluxo a Vivo serviu (novo checkout vs contingencia).
    // A entryUrl continua a mesma: quando o fluxo novo esta ativo, a Vivo redireciona
    // server-side para internet.vivo.com.br/checkouts/fibra/?id=...&offer=...
    const det = await navigateAndDetect(page, z.entryUrl, {
      timeout: config.timeoutPorStepMs,
      fallbackUrl: entry.checkoutUrl ?? null,
    });
    state.debug.flow = { detected: det.flow, marker: det.marker, urlNovo: det.urlNovo };

    if (det.flow === 'bloqueado_akamai') {
      const diag = await captureFailureContext(page, 'A', config.capturarScreenshots).catch(() => null);
      Object.assign(byId.A, {
        status: 'fail',
        durationMs: 0,
        screenshotUrl: diag?.screenshotUrl ?? null,
        detalhe: `BLOQUEIO ANTI-BOT (Akamai Access Denied) — nao e instabilidade do funil. Sugestao: retry com proxyMode residential-br. || url=${diag?.url}`,
      });
      state.error = 'Bloqueio anti-bot (Akamai) na entrada do funil.';
      return buildOutput({ runStartedAt, results, ...state, scenario });
    }

    if (det.flow === 'desconhecido') {
      const diag = await captureFailureContext(page, 'A', config.capturarScreenshots).catch(() => null);
      Object.assign(byId.A, {
        status: 'fail',
        durationMs: 0,
        screenshotUrl: diag?.screenshotUrl ?? null,
        detalhe: `fluxo DESCONHECIDO (nem checkout novo nem contingencia) || url=${diag?.url} | title=${diag?.title} | tela="${diag?.snippet ?? ''}"`,
      });
      state.error = 'Fluxo desconhecido: a pagina servida nao corresponde a nenhum fluxo conhecido.';
      return buildOutput({ runStartedAt, results, ...state, scenario });
    }

    const ctx = { page, net, scenario, entry, entryUrl: z.entryUrl, config, state, alreadyAtEntry: true };

    // D (Topaz) e observacional e serve para os dois fluxos.
    const sequence =
      det.flow === 'novo'
        ? [
            ['A', runA_novo],
            ['B', runB_novo],
            ['C', runC_novo],
            ['D', runD],
            ['E', runE_novo],
            ['F', runF_novo],
          ]
        : [
            ['A', runA],
            ['B', runB],
            ['C', runC],
            ['D', runD],
            ['E', runE],
            ['F', runF],
          ];

    for (const [id, fn] of sequence) {
      log.info(`Checkpoint ${id} iniciando...`);
      const res = await fn(ctx);
      Object.assign(byId[id], res);
      log.info(`Checkpoint ${id}: ${res.status} (${res.durationMs}ms) ${res.detalhe ?? ''}`);
      if (res.status === 'fail') {
        // Garante evidencia da tela que quebrou (CA-04) mesmo que o checkpoint tenha
        // falhado antes do seu proprio screenshot, e despeja URL/titulo/texto no relatorio.
        const diag = await captureFailureContext(page, id, config.capturarScreenshots).catch(() => null);
        if (diag) {
          if (!byId[id].screenshotUrl) byId[id].screenshotUrl = diag.screenshotUrl;
          byId[id].detalhe = `${byId[id].detalhe ?? ''} || url=${diag.url} | title=${diag.title} | tela="${diag.snippet}"`;
        }
        state.error = `Falha no checkpoint ${id}: ${res.detalhe ?? ''}`;
        break; // os checkpoints seguintes permanecem 'skipped'
      }
    }
    // Fluxo novo: expoe as chamadas de API observadas para calibracao dos sinais
    // de rede (leadId, validacoes) nas primeiras runs reais.
    if (state.debug.flow?.detected === 'novo') state.debug.apiCalls = net.getApiCalls();
  } catch (e) {
    state.error = `Excecao inesperada: ${e.message}`;
    log.exception(e, 'Erro durante o fluxo de browser');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return buildOutput({ runStartedAt, results, ...state, scenario });
}

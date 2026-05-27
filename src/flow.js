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
  const state = { leadId: null, orderNumber: null, topazScore: null, error: null };

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

    // Warm-up anti-Akamai antes de tocar no deep-link de cadastro (ver browser.js).
    if (config.warmup) await warmUpAkamai(page, { timeout: config.timeoutPorStepMs });

    const ctx = { page, net, scenario, entry, entryUrl: z.entryUrl, config, state };

    const sequence = [
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
  } catch (e) {
    state.error = `Excecao inesperada: ${e.message}`;
    log.exception(e, 'Erro durante o fluxo de browser');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return buildOutput({ runStartedAt, results, ...state, scenario });
}

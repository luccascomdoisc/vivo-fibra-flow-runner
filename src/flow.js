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
import { FLOW_LABELS } from './lib/constants.js';
import { runA_novo } from './checkpoints/novo/a-dados-pessoais.js';
import { runB_novo } from './checkpoints/novo/b-dados-avanco.js';
import { runC_novo } from './checkpoints/novo/c-endereco-imovel.js';
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
    // 04/09/2026: Chrome real (imagem ja traz google-chrome) em vez do Chromium
    // headless-shell do Playwright; ver browser.js. 'chromium' volta ao anterior.
    browserChannel: input.config?.browserChannel ?? 'chrome',
    warmupUrl: input.config?.warmupUrl ?? undefined,
  };

  const results = emptyResults();
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const state = {
    leadId: null,
    orderNumber: null,
    topazScore: null,
    error: null,
    debug: { proxyMode: config.proxyMode, browser: null, userAgent: null, warmup: null, flow: null, avisos: [] },
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
    const launched = await launchBrowser({
      headless: config.headless,
      proxyMode: config.proxyMode,
      browserChannel: config.browserChannel,
    });
    browser = launched.browser;
    const { page } = launched;
    state.debug.browser = launched.browserInfo;
    const net = attachNetworkCapture(page);

    state.debug.userAgent = await page.evaluate(() => navigator.userAgent).catch(() => null);

    // Warm-up anti-Akamai antes de tocar no deep-link de cadastro (ver browser.js).
    if (config.warmup) {
      state.debug.warmup = await warmUpAkamai(page, { timeout: config.timeoutPorStepMs, url: config.warmupUrl });
    }

    // Navega e detecta qual fluxo a Vivo serviu (checkout novo/Infinity vs Tatico).
    // A entryUrl continua a mesma: quando o fluxo novo esta ativo, a Vivo redireciona
    // server-side para internet.vivo.com.br/checkouts/fibra/?id=...&offer=...
    const det = await navigateAndDetect(page, z.entryUrl, {
      timeout: config.timeoutPorStepMs,
      fallbackUrl: entry.checkoutUrl ?? null,
    });
    // nome = rotulo de negocio do fluxo (Infinity / Tatico). O n8n usa esse campo
    // para dizer no alerta QUAL funil quebrou, sem precisar traduzir novo/antigo.
    state.debug.flow = {
      detected: det.flow,
      nome: FLOW_LABELS[det.flow] ?? det.flow,
      marker: det.marker,
      urlNovo: det.urlNovo,
    };

    if (det.flow === 'bloqueado_akamai') {
      const diag = await captureFailureContext(page, 'A', config.capturarScreenshots).catch(() => null);
      Object.assign(byId.A, {
        status: 'fail',
        durationMs: 0,
        screenshotUrl: diag?.screenshotUrl ?? null,
        detalhe: `BLOQUEIO ANTI-BOT (Akamai Access Denied) — nao e instabilidade do funil (usuario real carrega a pagina). Proxy nao resolve (testado 04/09). Verificar browserChannel/fingerprint. || url=${diag?.url}`,
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
        detalhe: `fluxo DESCONHECIDO (nem checkout novo (Infinity) nem Tatico) || url=${diag?.url} | title=${diag?.title} | tela="${diag?.snippet ?? ''}"`,
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
    // Infinity: expoe as chamadas observadas + o estado das dependencias de
    // terceiro (ViaCEP para o autofill, brasilapi para as datas). Serve para o
    // alerta distinguir "funil da Vivo quebrou" de "terceiro caiu".
    if (state.debug.flow?.detected === 'novo') {
      state.debug.apiCalls = net.getApiCalls();
      state.debug.deps = { viacep: net.getViaCep(), feriados: net.getFeriados() };
      state.debug.tatico = net.getTatico();
    }
  } catch (e) {
    state.error = `Excecao inesperada: ${e.message}`;
    log.exception(e, 'Erro durante o fluxo de browser');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return buildOutput({ runStartedAt, results, ...state, scenario });
}

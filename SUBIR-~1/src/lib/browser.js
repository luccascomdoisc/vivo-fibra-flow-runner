import { chromium } from 'playwright';
import { Actor, log } from 'apify';
import { newInjectedContext } from 'fingerprint-injector';

/**
 * Sobe um Chromium real com fingerprint INJETADO e coerente. O modo de proxy e
 * configuravel via input (config.proxyMode):
 *  - 'none'           -> sem proxy (IP direto do Actor na Apify). Mais barato.
 *  - 'datacenter'     -> Apify Proxy datacenter (grupo padrao).
 *  - 'residential-br' -> Apify Proxy residencial, countryCode BR.
 *  - 'residential-auto' -> Apify Proxy residencial sem pais fixo.
 *
 * loja.vivo.com.br esta atras do Akamai Bot Manager. Confirmado empiricamente: Playwright
 * cru (UA setado na mao, sem casar com Sec-CH-UA, sinais de headless) toma "Access Denied"
 * (403) em qualquer IP/proxy; ja o apify/rag-web-browser (que injeta fingerprint via
 * header-generator) pega a mesma URL com 200. Por isso usamos fingerprint-injector:
 * UA + Sec-CH-UA + navigator + webgl etc. todos consistentes (Windows/Chrome desktop).
 */
export async function launchBrowser({ headless = true, proxyMode = 'none' } = {}) {
  const proxy = await resolveProxy(proxyMode);

  const browser = await chromium.launch({
    headless,
    proxy,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await newInjectedContext(browser, {
    fingerprintOptions: {
      devices: ['desktop'],
      operatingSystems: ['windows'],
      // minVersion alto: o gerador pode sortear versoes proximas do minimo, e um
      // Chrome 119/120 (2023) e flag na certa para o Akamai (visto na pratica: run
      // com UA Chrome/120 tomou Access Denied; com Chrome/145 passou).
      browsers: [{ name: 'chrome', minVersion: 135 }],
      locales: ['pt-BR'],
    },
    newContextOptions: {
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      viewport: { width: 1366, height: 900 },
    },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { browser, context, page };
}

/**
 * Warm-up anti-Akamai: visita a raiz de loja.vivo.com.br para que o sensor do Akamai
 * Bot Manager execute e sete os cookies de sessao (_abck / bm_sz) ANTES de irmos ao
 * deep-link de cadastro. Sem isso, bater direto na URL profunda como 1a request do
 * browser resulta em "Access Denied" do Akamai (edgesuite). Best-effort: nunca derruba
 * o fluxo — se o warm-up falhar, o checkpoint A ainda tenta e reporta o que achar.
 */
export async function warmUpAkamai(page, { timeout = 30000 } = {}) {
  const diag = { status: null, title: null, abck: false, error: null };
  try {
    const resp = await page.goto('https://loja.vivo.com.br/', {
      waitUntil: 'domcontentloaded',
      timeout,
    });
    diag.status = resp?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    // Interacao leve: o sensor Akamai coleta eventos de mouse/movimento para validar.
    await page.mouse.move(220, 240).catch(() => {});
    await page.mouse.move(480, 520).catch(() => {});
    await page.waitForTimeout(2500);
    diag.title = await page.title().catch(() => null);
    const cookies = await page.context().cookies('https://loja.vivo.com.br').catch(() => []);
    diag.abck = cookies.some((c) => c.name === '_abck');
    log.info(`Warm-up Akamai: status=${diag.status} title="${diag.title}" _abck=${diag.abck}`);
  } catch (e) {
    diag.error = e.message;
    log.warning(`Warm-up Akamai falhou (seguindo mesmo assim): ${e.message}`);
  }
  return diag;
}

/** Resolve a config de proxy do Playwright a partir do modo escolhido (undefined = sem proxy). */
async function resolveProxy(proxyMode) {
  if (!proxyMode || proxyMode === 'none') {
    log.info('Browser sem proxy (IP direto do Actor).');
    return undefined;
  }

  const opts =
    proxyMode === 'residential-br'
      ? { groups: ['RESIDENTIAL'], countryCode: 'BR' }
      : proxyMode === 'residential-auto'
        ? { groups: ['RESIDENTIAL'] }
        : {}; // 'datacenter' -> grupo padrao da Apify

  try {
    const cfg = await Actor.createProxyConfiguration(opts);
    if (!cfg) {
      log.warning(`proxyMode='${proxyMode}' indisponivel nesta conta; seguindo com IP direto.`);
      return undefined;
    }
    const u = new URL(await cfg.newUrl());
    log.info(`Proxy '${proxyMode}' configurado (${u.hostname}:${u.port}).`);
    return {
      server: `${u.protocol}//${u.hostname}:${u.port}`,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  } catch (e) {
    log.warning(`Falha ao configurar proxy '${proxyMode}' (seguindo com IP direto): ${e.message}`);
    return undefined;
  }
}

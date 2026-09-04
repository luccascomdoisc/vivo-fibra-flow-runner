import { chromium } from 'playwright';
import { Actor, log } from 'apify';
import { newInjectedContext } from 'fingerprint-injector';

/**
 * URL de warm-up padrao: a LP real de Fibra (mesma jornada do usuario). Antes era a
 * raiz de loja.vivo.com.br, que responde 404 desde ago/2026 — o sensor do Akamai nem
 * chegava a rodar ali. A LP fica em .vivo.com.br, entao os cookies (_abck / bm_sz)
 * valem para loja.vivo.com.br, internet.vivo.com.br e checkout-portal.vivo.com.br.
 */
export const WARMUP_URL_DEFAULT = 'https://internet.vivo.com.br/ofertas/fibra-e-pos/';

/**
 * Sobe um navegador REAL com fingerprint INJETADO e coerente.
 *
 * Historico do que o Akamai (Bot Manager) da Vivo aceitou e recusou:
 *  - jun/2026: Playwright cru (UA na mao, sinais de headless) -> 403 em qualquer IP.
 *    Chromium + fingerprint-injector -> 200. Conclusao: o que decide e coerencia de
 *    fingerprint, nao IP.
 *  - 04/09/2026: a Vivo passou a redirecionar o cadastro para um host novo,
 *    checkout-portal.vivo.com.br, com politica mais dura. O mesmo Chromium headless +
 *    fingerprint-injector que passava em internet.vivo.com.br tomou Access Denied ali,
 *    tanto com IP de datacenter quanto com proxy residencial BR (testado). Um Chrome
 *    real, do IP de um humano, carregou a pagina normalmente. Ou seja: o bloqueio e na
 *    borda (TLS/HTTP2/headers), e o suspeito e o binario — Chromium "headless-shell" do
 *    Playwright anunciando UA de Chrome 145 (mismatch UA x motor real).
 *
 * Por isso, agora:
 *  1. Preferimos o Google Chrome estavel que a imagem apify/actor-node-playwright-chrome
 *     ja traz (channel 'chrome'), com fallback para o Chromium do Playwright.
 *  2. O fingerprint gerado e TRAVADO na versao major do binario real (browser.version()),
 *     para UA, Sec-CH-UA e navigator.userAgentData baterem com o TLS/HTTP2 do motor.
 *
 * config.browserChannel: 'chrome' (padrao) | 'chromium'.
 * config.proxyMode: 'none' | 'datacenter' | 'residential-br' | 'residential-auto'.
 */
export async function launchBrowser({ headless = true, proxyMode = 'none', browserChannel = 'chrome' } = {}) {
  const proxy = await resolveProxy(proxyMode);

  const args = [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ];

  const { browser, channelUsed } = await launchWithFallback({ headless, proxy, args, browserChannel });

  const version = browser.version(); // ex.: "140.0.7339.80"
  const major = Number.parseInt(version.split('.')[0], 10);
  log.info(`Navegador: ${channelUsed} ${version} (headless=${headless})`);

  const context = await newInjectedContextMatchingBinary(browser, major);

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { browser, context, page, browserInfo: { channel: channelUsed, version } };
}

/** Tenta o canal pedido; se nao existir na imagem, cai para o Chromium do Playwright. */
async function launchWithFallback({ headless, proxy, args, browserChannel }) {
  if (browserChannel === 'chrome') {
    try {
      const browser = await chromium.launch({ headless, proxy, args, channel: 'chrome' });
      return { browser, channelUsed: 'chrome' };
    } catch (e) {
      log.warning(`Google Chrome indisponivel (channel 'chrome'); usando Chromium do Playwright. Motivo: ${e.message}`);
    }
  }
  const browser = await chromium.launch({ headless, proxy, args });
  return { browser, channelUsed: 'chromium' };
}

/**
 * Cria o contexto com fingerprint coerente com o binario real. Primeiro tenta travar
 * exatamente no major do navegador; se o dataset do gerador ainda nao tiver essa versao
 * (binario muito novo), relaxa para "proximo do major, sem passar dele" — anunciar uma
 * versao MAIOR que a do motor e o pior caso (mismatch), entao maxVersion e sempre o major.
 */
async function newInjectedContextMatchingBinary(browser, major) {
  const newContextOptions = {
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1366, height: 900 },
  };
  const base = { devices: ['desktop'], operatingSystems: ['windows'], locales: ['pt-BR'] };

  const attempts = [
    { name: 'chrome', minVersion: major, maxVersion: major },
    { name: 'chrome', minVersion: Math.max(major - 6, 100), maxVersion: major },
    { name: 'chrome', minVersion: 135 }, // ultimo recurso: comportamento anterior
  ];

  let lastErr;
  for (const spec of attempts) {
    try {
      const ctx = await newInjectedContext(browser, {
        fingerprintOptions: { ...base, browsers: [spec] },
        newContextOptions,
      });
      log.info(`Fingerprint: chrome ${spec.minVersion}${spec.maxVersion ? `-${spec.maxVersion}` : '+'} (binario major=${major})`);
      return ctx;
    } catch (e) {
      lastErr = e;
      log.warning(`Fingerprint chrome ${spec.minVersion}-${spec.maxVersion ?? '∞'} indisponivel: ${e.message}`);
    }
  }
  throw lastErr;
}

/**
 * Warm-up anti-Akamai: navegacao REAL (nao fetch) por uma pagina em .vivo.com.br para
 * o sensor do Bot Manager rodar e setar _abck / bm_sz ANTES do deep-link de cadastro.
 * Inclui movimento de mouse e scroll leve (o sensor coleta esses eventos). Best-effort:
 * nunca derruba o fluxo — se falhar, o checkpoint A ainda tenta e reporta o que achar.
 */
export async function warmUpAkamai(page, { timeout = 30000, url = WARMUP_URL_DEFAULT } = {}) {
  const diag = { url, status: null, title: null, abck: false, bmsz: false, error: null };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    diag.status = resp?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    // Interacao leve e "humana": mouse em curva + scroll curto + pausa.
    await page.mouse.move(180, 210).catch(() => {});
    await page.mouse.move(420, 330, { steps: 12 }).catch(() => {});
    await page.mouse.wheel(0, 320).catch(() => {});
    await page.waitForTimeout(1200);
    await page.mouse.move(640, 480, { steps: 10 }).catch(() => {});
    await page.waitForTimeout(1800);
    diag.title = await page.title().catch(() => null);
    const cookies = await page.context().cookies().catch(() => []);
    diag.abck = cookies.some((c) => c.name === '_abck');
    diag.bmsz = cookies.some((c) => c.name === 'bm_sz');
    log.info(`Warm-up Akamai: url=${url} status=${diag.status} title="${diag.title}" _abck=${diag.abck} bm_sz=${diag.bmsz}`);
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

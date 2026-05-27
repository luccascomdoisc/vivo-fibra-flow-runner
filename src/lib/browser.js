import { chromium } from 'playwright';
import { Actor, log } from 'apify';

/**
 * Sobe um Chromium real com stealth leve. O modo de proxy e configuravel via input
 * (config.proxyMode) para testar empiricamente qual rota alcanca a Vivo:
 *  - 'none'           -> sem proxy (IP direto do Actor na Apify). Mais barato.
 *  - 'datacenter'     -> Apify Proxy datacenter (grupo padrao, incluso na maioria dos planos).
 *  - 'residential-br' -> Apify Proxy residencial, countryCode BR (premium; pode nao estar habilitado).
 *  - 'residential-auto' -> Apify Proxy residencial sem pais fixo.
 *
 * Stealth leve basta: a Vivo Fibra nao tem Cloudflare nem reCAPTCHA (confirmado no HAR);
 * o unico anti-bot e o token Tsource, gerado pelo proprio JS da pagina.
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

  const context = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1366, height: 900 },
  });

  // Stealth basico: navigator.webdriver nao deve ser true.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { browser, context, page };
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

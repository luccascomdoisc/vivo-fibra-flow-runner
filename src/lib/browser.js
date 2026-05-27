import { chromium } from 'playwright';
import { Actor, log } from 'apify';

/**
 * Sobe um Chromium real com stealth leve + Apify Proxy residencial BR.
 * Stealth leve basta: a Vivo Fibra nao tem Cloudflare nem reCAPTCHA (confirmado no HAR);
 * o unico anti-bot e o token Tsource, gerado pelo proprio JS da pagina.
 */
export async function launchBrowser({ headless = true } = {}) {
  let proxy;
  try {
    const proxyConfiguration = await Actor.createProxyConfiguration({
      groups: ['RESIDENTIAL'],
      countryCode: 'BR',
    });
    if (proxyConfiguration) {
      const proxyUrl = await proxyConfiguration.newUrl();
      const u = new URL(proxyUrl);
      proxy = {
        server: `${u.protocol}//${u.hostname}:${u.port}`,
        username: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
      };
      log.info('Proxy residencial BR configurado.');
    }
  } catch (e) {
    log.warning(`Sem proxy configurado (seguindo com IP direto): ${e.message}`);
  }

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

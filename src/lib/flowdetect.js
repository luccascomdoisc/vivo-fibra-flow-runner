import { log } from 'apify';

/**
 * Navega ate a entryUrl e detecta qual fluxo a Vivo serviu.
 *
 * Contexto (jul/2026): a URL antiga de cadastro (loja.vivo.com.br/produtos-vivo/
 * cadastro/vivofibra?productsIds&promotion) passou a REDIRECIONAR server-side para o
 * checkout novo (internet.vivo.com.br/checkouts/fibra/?id=...&offer=...). O fluxo
 * antigo continua existindo como contingencia: quando ele esta ativo, nao ha redirect.
 * Logo, a deteccao e: goto na entryUrl -> inspecionar URL final + marcadores de DOM.
 *
 * Retorna { flow: 'novo' | 'antigo' | 'desconhecido', finalUrl, marker }.
 */
export async function navigateAndDetect(page, entryUrl, { timeout = 30000, fallbackUrl = null } = {}) {
  await page.goto(entryUrl, {
    waitUntil: 'domcontentloaded',
    timeout,
    referer: 'https://loja.vivo.com.br/',
  });

  // Bloqueio anti-bot do Akamai na entrada legada (loja.vivo.com.br): nao e "site
  // quebrado" nem "fluxo desconhecido" — e infra anti-bot. Se temos a URL direta do
  // checkout novo (entry.checkoutUrl), tentamos por ela; internet.vivo.com.br nao
  // demonstrou a mesma protecao agressiva.
  if (await isAkamaiDenied(page)) {
    if (fallbackUrl) {
      log.warning('Akamai bloqueou a entrada legada; tentando checkout novo direto.');
      await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout, referer: 'https://internet.vivo.com.br/' });
      if (await isAkamaiDenied(page)) {
        return { flow: 'bloqueado_akamai', finalUrl: page.url(), marker: 'Access Denied (legada e fallback)', urlNovo: false };
      }
    } else {
      return { flow: 'bloqueado_akamai', finalUrl: page.url(), marker: 'Access Denied (edgesuite)', urlNovo: false };
    }
  }

  // O checkout novo e um SPA Next.js: o conteudo real so existe apos a hidratacao.
  // Espera curta por QUALQUER um dos marcadores (novo ou antigo) antes de decidir.
  const deadline = Date.now() + timeout;
  let flow = 'desconhecido';
  let marker = null;

  while (Date.now() < deadline) {
    const found = await page
      .evaluate(() => {
        const temNovo =
          !!document.getElementById('Name') &&
          !!document.querySelector('form') &&
          /vamos iniciar sua compra online/i.test(document.body.innerText || '');
        const temAntigo = /Informe seus dados pessoais/i.test(document.body.innerText || '');
        return { temNovo, temAntigo };
      })
      .catch(() => ({ temNovo: false, temAntigo: false }));

    if (found.temNovo) {
      flow = 'novo';
      marker = '#Name + H1 "vamos iniciar sua compra online"';
      break;
    }
    if (found.temAntigo) {
      flow = 'antigo';
      marker = 'ancora "Informe seus dados pessoais"';
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Confirmacao secundaria pela URL final (nao decide sozinha, so enriquece o debug).
  const finalUrl = page.url();
  const urlNovo = finalUrl.includes('/checkouts/fibra');

  log.info(`Deteccao de fluxo: ${flow} (url=${urlNovo ? 'checkouts/fibra' : 'legado'}; marker=${marker ?? 'nenhum'})`);
  return { flow, finalUrl, marker, urlNovo };
}

/** Pagina de negacao do Akamai Bot Manager (edgesuite). */
async function isAkamaiDenied(page) {
  try {
    const title = await page.title();
    if (/access denied/i.test(title)) return true;
    const body = await page.locator('body').innerText({ timeout: 2000 });
    return /access denied/i.test(body) && /edgesuite|reference #/i.test(body);
  } catch {
    return false;
  }
}

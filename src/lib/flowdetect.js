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
export async function navigateAndDetect(page, entryUrl, { timeout = 30000 } = {}) {
  await page.goto(entryUrl, {
    waitUntil: 'domcontentloaded',
    timeout,
    referer: 'https://loja.vivo.com.br/',
  });

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

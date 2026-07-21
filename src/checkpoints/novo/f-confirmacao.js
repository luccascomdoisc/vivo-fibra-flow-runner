import { ANCHORS_NOVO } from '../../lib/constants.js';
import { clickContinuarCompra, waitForText, makeResult } from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [FLUXO NOVO] Checkpoint F - Confirmacao: submete o Agendamento (botao
 * "Continuar compra", aqui type="submit" — e o commit real do pedido) e aguarda
 * a tela "Pedido realizado com sucesso!".
 *
 * leadId: no fluxo antigo vinha do POST /asb SubType=10 ("112|leadId|INVALIDO|ms").
 * O BFF do fluxo novo ainda NAO foi confirmado; tentamos (1) o mesmo asb, (2) o
 * data layer, (3) padrao #VIV no DOM. O que nao vier fica em debug.apiCalls para
 * calibrarmos apos as primeiras runs reais.
 */
export async function runF_novo(ctx) {
  const { page, net, state, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    await clickContinuarCompra(page);
    await waitForText(page, ANCHORS_NOVO.SUCESSO, config.timeoutPorStepMs);
    screenshotUrl = await captureScreenshot(page, 'F', config.capturarScreenshots);

    // (1) BFF asb legado, caso o backend seja o mesmo.
    const asb = net.getAsb('10');
    if (asb?.result) {
      const parts = String(asb.result).split('|');
      if (parts[1] && /^\d+$/.test(parts[1])) state.leadId = parts[1];
    }

    // (2) dataLayer (Topaz/pedido costumam ecoar ali) + (3) numero do pedido no DOM.
    try {
      const extra = await page.evaluate(() => {
        const dl = window.dataLayer ?? [];
        const flat = JSON.stringify(dl);
        const lead = flat.match(/"lead[_ ]?id"\s*:\s*"?(\d+)"?/i);
        const order = (document.body.innerText || '').match(/#?VIV\d{8,}\d*/);
        return { lead: lead?.[1] ?? null, order: order?.[0] ?? null };
      });
      if (!state.leadId && extra.lead) state.leadId = extra.lead;
      if (extra.order) state.orderNumber = extra.order.startsWith('#') ? extra.order : `#${extra.order}`;
    } catch {
      /* melhor-esforco */
    }

    return makeResult(
      'ok',
      start,
      screenshotUrl,
      `fluxo novo; sucesso visivel; leadId=${state.leadId ?? 'n/a'}; pedido=${state.orderNumber ?? 'n/a'}`,
    );
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `fluxo novo; erro: ${e.message}`);
  }
}

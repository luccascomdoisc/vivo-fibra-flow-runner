import { ANCHORS_NOVO, NOVO_ROUTES } from '../../lib/constants.js';
import { clickContinuarCompra, waitForRoute, waitForText, makeResult } from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [TATICO] Checkpoint F - Confirmacao: submete o Agendamento (o botao "Continuar
 * compra" desta etapa e type="submit" — e o commit real do pedido) e aguarda a
 * rota /checkouts/fibra/confirmacao/<numeroDoPedido>.
 *
 * Numero do pedido: vem no PROPRIO PATH da confirmacao (ex.: 20260821-5757026) e
 * e o mesmo transaction_id que o dataLayer publica no evento purchase.
 * leadId: do backend Tatico (asbb2c) — "102|<leadId>|<marcador>|<ms>".
 *
 * Marcador do lead: no Infinity vinha "INVALIDO" (combinado com a midia Vivo para
 * descarte). No Tatico as duas capturas de 21/08 voltaram "DUPLICADO". Guardamos o
 * marcador no detalhe para a midia confirmar como o lead sintetico e descartado.
 */
export async function runF_novo(ctx) {
  const { page, net, state, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    await clickContinuarCompra(page);
    await waitForRoute(page, NOVO_ROUTES.CONFIRMACAO, config.timeoutPorStepMs);

    // Reforco visual (nao decide): a tela de sucesso e a unica com <h1> proprio.
    await waitForText(page, ANCHORS_NOVO.SUCESSO, 8000).catch(() => {});
    screenshotUrl = await captureScreenshot(page, 'F', config.capturarScreenshots);

    // (1) numero do pedido no path da rota de confirmacao.
    const m = page.url().match(/\/confirmacao\/([^/?#]+)/);
    if (m) state.orderNumber = decodeURIComponent(m[1]);

    // (2) leadId + marcador no backend Tatico.
    const lead = net.getTaticoLead();
    let marcador = null;
    if (lead) {
      if (lead.leadId) state.leadId = lead.leadId;
      marcador = lead.marcador ?? null;
    }

    // (3) fallback: dataLayer (transaction_id do evento purchase) e asb legado.
    if (!state.leadId || !state.orderNumber) {
      try {
        const extra = await page.evaluate(() => {
          const flat = JSON.stringify(window.dataLayer ?? []);
          const lead = flat.match(/"lead[_ ]?id"\s*:\s*"?(\d+)"?/i);
          const tx = flat.match(/"transaction_id"\s*:\s*"([^"]+)"/i);
          return { lead: lead?.[1] ?? null, tx: tx?.[1] ?? null };
        });
        if (!state.leadId && extra.lead) state.leadId = extra.lead;
        if (!state.orderNumber && extra.tx) state.orderNumber = extra.tx;
      } catch {
        /* melhor-esforco */
      }
    }

    return makeResult(
      'ok',
      start,
      screenshotUrl,
      `Tatico; pedido concluido; pedido=${state.orderNumber ?? 'n/a'}; leadId=${state.leadId ?? 'n/a'}${marcador ? `; marcador=${marcador}` : ''}`,
    );
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `Tatico; erro: ${e.message}`);
  }
}

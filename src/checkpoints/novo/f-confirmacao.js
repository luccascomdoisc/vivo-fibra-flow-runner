import { ANCHORS_NOVO } from '../../lib/constants.js';
import { clickContinuarCompra, waitForText, makeResult } from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [TATICO] Checkpoint F - Confirmacao: submete o Agendamento (o botao "Continuar
 * compra" desta etapa e type="submit" — e o commit real do pedido) e aguarda a
 * tela de sucesso.
 *
 * Sinal de sucesso: o texto "Pedido realizado com sucesso" — esta e a UNICA tela
 * do Tatico com <h1> proprio, e por isso a unica em que ancora de texto e legitima.
 * A URL nao ajuda: continua em /checkouts/fibra/ (o /confirmacao/<pedido> que
 * aparece nas capturas e path virtual de GA).
 *
 * Numero do pedido: transaction_id do evento purchase no dataLayer.
 * leadId: backend Tatico (asbb2c) — "112|<leadId>|<marcador>|<ms>".
 *
 * Marcador do lead: o Infinity devolvia INVALIDO (base do acordo de descarte com
 * a midia Vivo). No Tatico ja vimos INVALIDO (CPF novo) e DUPLICADO (CPF/e-mail
 * repetido) — guardamos o marcador no detalhe para acompanhar.
 */
export async function runF_novo(ctx) {
  const { page, net, state, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    await clickContinuarCompra(page);
    await waitForText(page, ANCHORS_NOVO.SUCESSO, config.timeoutPorStepMs);
    screenshotUrl = await captureScreenshot(page, 'F', config.capturarScreenshots);

    // (1) leadId + marcador do backend.
    const lead = net.getTaticoLead();
    let marcador = null;
    if (lead) {
      if (lead.leadId) state.leadId = lead.leadId;
      marcador = lead.marcador ?? null;
    }

    // (2) numero do pedido, em ordem de confiabilidade:
    //   a) hit de telemetria capturado pelo listener (ep.transaction_id / oid);
    //   b) dataLayer, se a Vivo passar a expor transaction_id ali;
    //   c) URL, se algum dia houver navegacao real entre as etapas.
    state.orderNumber = net.getOrderNumber();
    if (!state.orderNumber || !state.leadId) {
      try {
        const extra = await page.evaluate(() => {
          const flat = JSON.stringify(window.dataLayer ?? []);
          const tx = flat.match(/"transaction_id"\s*:\s*"?([\w-]+)"?/i);
          const lead = flat.match(/"lead[_ ]?id"\s*:\s*"?(\d+)"?/i);
          return { tx: tx?.[1] ?? null, lead: lead?.[1] ?? null };
        });
        if (!state.orderNumber && extra.tx) state.orderNumber = extra.tx;
        if (!state.leadId && extra.lead) state.leadId = extra.lead;
      } catch {
        /* melhor-esforco */
      }
    }
    if (!state.orderNumber) {
      const m = page.url().match(/\/confirmacao\/([^/?#]+)/);
      if (m) state.orderNumber = decodeURIComponent(m[1]);
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

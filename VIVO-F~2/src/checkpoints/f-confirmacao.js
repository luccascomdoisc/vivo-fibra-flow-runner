import { ANCHORS } from '../lib/constants.js';
import { clickButton, waitOkSignal, makeResult } from '../lib/checkpoint.js';
import { captureScreenshot } from '../lib/screenshot.js';

/**
 * Checkpoint F - Confirmacao: clica "Concluir pedido", aguarda a tela "Deu certo!"
 * (ou o asb SubType=10 -> 200), extrai leadId (2o campo do result) e o numero do pedido.
 * Fecha o popup "Fique Ligado" se aparecer (nao bloqueante).
 * Este e o submit que gera o lead INVALIDO no CRM Vivo (acordado com midia Vivo).
 */
export async function runF(ctx) {
  const { page, net, state, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    await clickButton(page, 'Concluir pedido');

    const signal = await waitOkSignal(page, net, {
      nextAnchor: ANCHORS.F,
      subType: '10',
      timeout: config.timeoutPorStepMs,
    });

    // Popup "Fique Ligado" pos-conclusao: fecha se aparecer (nao bloqueia).
    await page
      .getByText('Fique Ligado', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => page.keyboard.press('Escape').catch(() => {}))
      .catch(() => {});

    screenshotUrl = await captureScreenshot(page, 'F', config.capturarScreenshots);

    // leadId via network (result = "112|{leadId}|INVALIDO|{ms}").
    const asb = net.getAsb('10');
    if (asb?.result) {
      const parts = String(asb.result).split('|');
      if (parts[1] && /^\d+$/.test(parts[1])) state.leadId = parts[1];
    }

    // numero do pedido via DOM (#VIV{YYYYMMDD}{digitos}).
    try {
      const bodyText = await page.locator('body').innerText({ timeout: 3000 });
      const m = bodyText.match(/#VIV\d{8}\d+/);
      if (m) state.orderNumber = m[0];
    } catch {
      /* opcional */
    }

    if (!signal && !state.leadId) {
      return makeResult('fail', start, screenshotUrl, `sem confirmacao de sucesso (asb=${asb?.status ?? 'n/a'})`);
    }
    return makeResult('ok', start, screenshotUrl, `via ${signal ?? 'leadId'}; leadId=${state.leadId ?? 'n/a'}`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `erro: ${e.message}`);
  }
}

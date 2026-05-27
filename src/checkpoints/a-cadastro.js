import { ANCHORS } from '../lib/constants.js';
import { fillField, clickButton, waitForText, waitOkSignal, makeResult } from '../lib/checkpoint.js';
import { captureScreenshot } from '../lib/screenshot.js';

/**
 * Checkpoint A - Cadastro inicial: navega ate a URL de cadastro e preenche
 * nome, celular, CEP e numero. Avanca com "Continuar".
 * OK = ancora da tela B ("Dados pessoais") OU asb SubType=1 -> 200.
 */
export async function runA(ctx) {
  const { page, net, scenario, entryUrl, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    await page.goto(entryUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutPorStepMs,
      referer: 'https://loja.vivo.com.br/',
    });
    await waitForText(page, ANCHORS.A, config.timeoutPorStepMs);
    screenshotUrl = await captureScreenshot(page, 'A', config.capturarScreenshots);

    await fillField(page, 'Nome completo', scenario.nome);
    await fillField(page, 'Celular', scenario.celular);
    await fillField(page, 'CEP', scenario.cep);
    await fillField(page, 'Número da residência', scenario.numeroResidencia);

    await clickButton(page, 'Continuar');

    const signal = await waitOkSignal(page, net, {
      nextAnchor: ANCHORS.B,
      subType: '1',
      timeout: config.timeoutPorStepMs,
    });
    const asb = net.getAsb('1');

    if (!signal) {
      return makeResult('fail', start, screenshotUrl, `sem avanco apos Continuar (asb=${asb?.status ?? 'n/a'})`);
    }
    return makeResult('ok', start, screenshotUrl, `via ${signal}; asb=${asb?.status ?? 'n/a'}`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `erro: ${e.message}`);
  }
}

import { ANCHORS } from '../lib/constants.js';
import { fillField, clickButton, waitOkSignal, makeResult } from '../lib/checkpoint.js';
import { captureScreenshot } from '../lib/screenshot.js';

/**
 * Checkpoint B - Dados pessoais: CPF, data de nascimento e e-mail. Avanca com "Continuar".
 * OK = ancora da tela C ("Endereço de instalação da fibra") OU asb SubType=2 -> 200.
 * Obs.: a Vivo valida o DV mod-11 do CPF; o n8n ja envia um CPF valido.
 */
export async function runB(ctx) {
  const { page, net, scenario, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    screenshotUrl = await captureScreenshot(page, 'B', config.capturarScreenshots);

    await fillField(page, 'CPF', scenario.cpf);
    await fillField(page, 'Data de nascimento', scenario.dataNascimento);
    await fillField(page, 'E-mail', scenario.email);

    await clickButton(page, 'Continuar');

    const signal = await waitOkSignal(page, net, {
      nextAnchor: ANCHORS.C,
      subType: '2',
      timeout: config.timeoutPorStepMs,
    });
    const asb = net.getAsb('2');

    if (!signal) {
      return makeResult('fail', start, screenshotUrl, `sem avanco apos Continuar (asb=${asb?.status ?? 'n/a'})`);
    }
    return makeResult('ok', start, screenshotUrl, `via ${signal}; asb=${asb?.status ?? 'n/a'}`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `erro: ${e.message}`);
  }
}

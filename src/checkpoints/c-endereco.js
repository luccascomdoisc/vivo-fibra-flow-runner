import { ANCHORS } from '../lib/constants.js';
import { fillField, clickByText, clickButton, waitOkSignal, makeResult } from '../lib/checkpoint.js';
import { captureScreenshot } from '../lib/screenshot.js';

/**
 * Checkpoint C - Endereco de instalacao: seleciona tipo de imovel "Edificio",
 * preenche complemento, andar e ponto de referencia. Avanca com "Continuar".
 * OK = ancora da tela de agendamento ("Agendar instalação") OU asb SubType=3 -> 200.
 *
 * BUG CONHECIDO da Vivo: as vezes o CEP e re-validado aqui e os campos travam (cinza,
 * nao-editaveis). Isso e instabilidade REAL do site -> fillField vai falhar e o
 * checkpoint vira 'fail'. E exatamente o que o agente existe para detectar; o recheck
 * do n8n separa instabilidade momentanea de quebra real.
 */
export async function runC(ctx) {
  const { page, net, scenario, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    screenshotUrl = await captureScreenshot(page, 'C', config.capturarScreenshots);

    // Tipo de imovel = Edificio (mais campos = mais cobertura do formulario).
    await clickByText(page, 'Edifício');

    await fillField(page, 'Complemento', scenario.complemento);
    await fillField(page, 'Andar', scenario.andar);
    await fillField(page, 'Ponto de referência', scenario.pontoReferencia);

    await clickButton(page, 'Continuar');

    const signal = await waitOkSignal(page, net, {
      nextAnchor: ANCHORS.E,
      subType: '3',
      timeout: config.timeoutPorStepMs,
    });
    const asb = net.getAsb('3');

    if (!signal) {
      return makeResult('fail', start, screenshotUrl, `sem avanco apos Continuar (asb=${asb?.status ?? 'n/a'})`);
    }
    return makeResult('ok', start, screenshotUrl, `via ${signal}; asb=${asb?.status ?? 'n/a'}`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `erro (possivel travamento de CEP): ${e.message}`);
  }
}

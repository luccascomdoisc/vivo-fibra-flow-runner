import { NOVO_IDS, ANCHORS_NOVO } from '../../lib/constants.js';
import {
  fillByIdVerified,
  clickContinuarCompra,
  coletarErrosValidacao,
  waitForText,
  makeResult,
} from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [FLUXO NOVO] Checkpoint C - Endereco de instalacao: tipo de imovel + campos
 * condicionais e SUBMIT da etapa "Dados". OK = ancora da etapa Agendamento.
 *
 * Detalhes do site:
 *  - Radio "Casa" vem pre-selecionado; "Edificio" cria o campo Andar (#Extra3).
 *  - O botao "Continuar compra" e type="button" com title errado -> clicar por texto.
 *  - Form invalido NAO navega: exibe validacao inline (coletada no detalhe).
 */
export async function runC_novo(ctx) {
  const { page, scenario, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    const querEdificio = /edif/i.test(scenario.tipoImovel ?? '');
    if (querEdificio) {
      // O label de texto NAO tem for= (clicar nele nao marca). O input radio
      // (id "Edifício", com acento) fica escondido sob um span estilizado:
      // clique com force no proprio input e confira o checked.
      const radio = page.locator('input[name="tipoImovel"][value="Edifício"]').first();
      await radio.click({ force: true });
      if (!(await radio.isChecked().catch(() => false))) {
        // fallback: clica no span "checkmark" dentro do label que envolve o input
        await radio.locator('xpath=following-sibling::span[1]').click({ force: true }).catch(() => {});
      }
      if (!(await radio.isChecked().catch(() => false))) {
        throw new Error('nao consegui selecionar tipo de imovel "Edifício"');
      }
      await fillByIdVerified(page, NOVO_IDS.andar, scenario.andar ?? '1');
    }

    await fillByIdVerified(page, NOVO_IDS.complemento, scenario.complemento ?? '1');
    await fillByIdVerified(page, NOVO_IDS.referencia, scenario.pontoReferencia ?? '1');

    screenshotUrl = await captureScreenshot(page, 'C', config.capturarScreenshots);
    await clickContinuarCompra(page);

    try {
      await waitForText(page, ANCHORS_NOVO.AGENDAMENTO, config.timeoutPorStepMs);
    } catch {
      const erros = await coletarErrosValidacao(page);
      const detalhe = erros.length
        ? `fluxo novo; form invalido: ${erros.join(', ')}`
        : 'fluxo novo; sem avanco apos Continuar compra (etapa Agendamento nao apareceu)';
      return makeResult('fail', start, screenshotUrl, detalhe);
    }

    return makeResult('ok', start, screenshotUrl, 'fluxo novo; etapa Dados submetida; Agendamento visivel');
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `fluxo novo; erro: ${e.message}`);
  }
}

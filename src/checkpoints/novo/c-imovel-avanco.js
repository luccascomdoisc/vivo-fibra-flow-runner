import { NOVO_IDS, ANCHORS_NOVO } from '../../lib/constants.js';
import {
  fillByIdVerified,
  clickContinuarCompra,
  coletarErrosValidacao,
  waitForText,
  makeResult,
  marcarInput,
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
      // O input radio real e invisivel (radio customizado) -> marcarInput cuida
      // do clique no label ancestral + verificacao do checked.
      const radio = page.locator('input[name="tipoImovel"][value="Edifício"]');
      if (!(await marcarInput(page, radio))) {
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

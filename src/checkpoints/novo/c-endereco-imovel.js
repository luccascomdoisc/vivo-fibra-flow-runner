import { NOVO_IDS, NOVO_NAMES, NOVO_STEP_FIELDS } from '../../lib/constants.js';
import {
  fillByIdVerified,
  fillByIdOrLabel,
  clickContinuarCompra,
  coletarErrosValidacao,
  waitForCampo,
  waitForHydration,
  marcarPorName,
  makeResult,
  avisar,
  sleep,
} from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [INFINITY] Checkpoint C - Endereco de instalacao (/checkouts/fibra/endereco).
 * Etapa criada pela Vivo depois do mapeamento de julho. Aqui e que vive o
 * autofill do CEP: Endereco, Bairro, Cidade e UF chegam preenchidos a partir da
 * resposta do ViaCEP disparada na etapa anterior.
 *
 * Detalhes do site (recaptura 21/08):
 *  - #Numero reaparece ja preenchido com o valor digitado na etapa Dados.
 *  - Radio "Casa" vem pre-selecionado; "Edifício" (id com acento) cria o campo
 *    Andar (#Extra3). Radios sao customizados -> marcarPorName cuida do label.
 *  - Botao "Continuar compra" e type="button" e o title esta errado -> clicar por texto.
 *  - Form invalido nao navega: exibe validacao inline (coletada no detalhe).
 */
export async function runC_novo(ctx) {
  const { page, scenario, config, state } = ctx;
  const start = Date.now();
  let screenshotUrl = null;
  const notas = [];

  try {
    await waitForHydration(page, `[id="${NOVO_IDS.endereco}"]`, { timeout: config.timeoutPorStepMs });

    // Autofill: espera o campo Endereco ganhar valor (a resposta do ViaCEP ja
    // chegou na etapa anterior, mas o preenchimento e assincrono na montagem).
    const deadline = Date.now() + config.timeoutPorStepMs;
    let endereco = '';
    while (Date.now() < deadline) {
      endereco = await page.locator(`[id="${NOVO_IDS.endereco}"]`).inputValue().catch(() => '');
      if (endereco.trim()) break;
      await sleep(400);
    }
    if (!endereco.trim()) {
      screenshotUrl = await captureScreenshot(page, 'C', config.capturarScreenshots);
      return makeResult('fail', start, screenshotUrl, 'Infinity; autofill do CEP nao preencheu o Endereco na etapa /endereco');
    }

    const bairro = await page.locator(`[id="${NOVO_IDS.bairro}"]`).inputValue().catch(() => '');
    const cidade = await page.locator(`[id="${NOVO_IDS.cidade}"]`).inputValue().catch(() => '');
    if (!bairro.trim()) notas.push('bairro vazio');
    if (!cidade.trim()) notas.push('cidade vazia');

    // Numero vem carregado da etapa Dados; se nao vier, preenche aqui.
    const numero = await page.locator(`[id="${NOVO_IDS.numero}"]`).inputValue().catch(() => '');
    if (!numero.trim()) {
      await fillByIdVerified(page, NOVO_IDS.numero, scenario.numeroResidencia);
      notas.push('numero reenviado');
    }

    // Tipo de imovel: Edificio exercita mais campos do form (exige Andar).
    const querEdificio = /edif/i.test(scenario.tipoImovel ?? '');
    if (querEdificio) {
      const ok = await marcarPorName(page, NOVO_NAMES.tipoImovel, 'Edifício').catch(() => false);
      if (!ok) throw new Error('nao consegui selecionar tipo de imovel "Edifício"');
      // 04/09/2026: #Extra3 parou de aparecer (rotulo "Andar" segue na tela) -> fallback por rotulo.
      const via = await fillByIdOrLabel(page, NOVO_IDS.andar, /^\s*andar/i, scenario.andar ?? '1');
      if (via !== 'id') avisar(state, `campo Andar localizado por ${via} — o id #${NOVO_IDS.andar} mudou`);
    }

    const viaComp = await fillByIdOrLabel(page, NOVO_IDS.complemento, /complemento/i, scenario.complemento ?? '1');
    if (viaComp !== 'id') avisar(state, `campo Complemento localizado por ${viaComp} — o id #${NOVO_IDS.complemento} mudou`);
    const viaRef = await fillByIdOrLabel(page, NOVO_IDS.referencia, /refer[eê]ncia/i, scenario.pontoReferencia ?? '1');
    if (viaRef !== 'id') avisar(state, `campo Referencia localizado por ${viaRef} — o id #${NOVO_IDS.referencia} mudou`);

    screenshotUrl = await captureScreenshot(page, 'C', config.capturarScreenshots);
    const viaBotao = await clickContinuarCompra(page);
    if (viaBotao !== 'texto') avisar(state, `botao de avanco (etapa Endereco) localizado por ${viaBotao} — a copy do botao mudou`);

    try {
      await waitForCampo(page, NOVO_STEP_FIELDS.AGENDAMENTO, config.timeoutPorStepMs);
    } catch {
      const erros = await coletarErrosValidacao(page);
      const detalhe = erros.length
        ? `Infinity; form invalido na etapa Endereco: ${erros.join(', ')}`
        : 'Infinity; sem avanco apos Continuar compra (etapa Agendamento nao apareceu)';
      return makeResult('fail', start, screenshotUrl, detalhe);
    }

    return makeResult(
      'ok',
      start,
      screenshotUrl,
      `Infinity; autofill ok ("${endereco.slice(0, 40)}"); botao via ${viaBotao}; etapa Agendamento na tela${notas.length ? `; ${notas.join(' | ')}` : ''}`,
    );
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `Infinity; erro: ${e.message}`);
  }
}

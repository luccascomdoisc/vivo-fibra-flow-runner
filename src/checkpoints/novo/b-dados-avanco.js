import { NOVO_IDS, NOVO_STEP_FIELDS } from '../../lib/constants.js';
import {
  fillByIdVerified,
  clickContinuarCompra,
  coletarErrosValidacao,
  waitForCampo,
  makeResult,
  avisar,
} from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [TATICO] Checkpoint B - Dados pessoais: CPF e data de nascimento (segunda
 * metade da etapa Dados) e SUBMIT da etapa. OK = o campo Endereco apareceu.
 *
 * Por que campo e nao texto nem rota: as quatro telas tem o MESMO <h1> e a URL
 * nunca muda (os paths /dados, /endereco... so existem nos hits de GA). O sinal
 * honesto de "avancou" e o campo exclusivo da etapa seguinte estar na tela.
 */
export async function runB_novo(ctx) {
  const { page, net, config, state } = ctx;
  const { scenario } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    await fillByIdVerified(page, NOVO_IDS.cpf, scenario.cpf);
    await fillByIdVerified(page, NOVO_IDS.dataNascimento, scenario.dataNascimento);

    // A Vivo valida cada campo no blur. Sem sair do ultimo campo, ele fica
    // "pendente" (sem o check verde) e polui o diagnostico de uma falha adiante.
    await page.locator(`[id="${NOVO_IDS.dataNascimento}"]`).press('Tab').catch(() => {});

    screenshotUrl = await captureScreenshot(page, 'B', config.capturarScreenshots);
    const viaBotao = await clickContinuarCompra(page);
    if (viaBotao !== 'texto') avisar(state, `botao de avanco (etapa Dados) localizado por ${viaBotao} — a copy do botao mudou`);

    try {
      await waitForCampo(page, NOVO_STEP_FIELDS.ENDERECO, config.timeoutPorStepMs);
    } catch {
      const erros = await coletarErrosValidacao(page);
      const detalhe = erros.length
        ? `Tatico; form invalido na etapa Dados: ${erros.join(', ')}`
        : 'Tatico; sem avanco apos Continuar compra (etapa Endereco nao apareceu)';
      return makeResult('fail', start, screenshotUrl, detalhe);
    }

    // O avanco da etapa Dados grava um lead parcial no backend (asbb2c):
    // "102|<leadId>|<marcador>|<ms>". Serve como confirmacao secundaria.
    const lead = net.getTaticoLead();
    const viaApi = lead ? `; asbb2c ${lead.codigo}|${lead.marcador} lead=${lead.leadId ?? 'n/a'}` : '';

    return makeResult('ok', start, screenshotUrl, `Tatico; etapa Dados submetida (botao via ${viaBotao}); etapa Endereco na tela${viaApi}`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `Tatico; erro: ${e.message}`);
  }
}

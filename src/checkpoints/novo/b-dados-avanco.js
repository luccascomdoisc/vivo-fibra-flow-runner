import { NOVO_IDS, NOVO_ROUTES } from '../../lib/constants.js';
import {
  fillByIdVerified,
  clickContinuarCompra,
  coletarErrosValidacao,
  waitForRoute,
  makeResult,
} from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [TATICO] Checkpoint B - Dados pessoais: CPF e data de nascimento (segunda
 * metade da etapa /dados) e SUBMIT da etapa. OK = a rota virou /endereco.
 *
 * Por que rota e nao texto: as quatro telas do Tatico tem o MESMO <h1>
 * ("Ola, vamos iniciar sua compra online"); so o path muda. O mapeamento de
 * julho apostava em ancora de texto e num autofill que hoje vive na tela
 * seguinte — foi isso que produziu o falso-positivo de 21/08.
 */
export async function runB_novo(ctx) {
  const { page, net, config } = ctx;
  const { scenario } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    await fillByIdVerified(page, NOVO_IDS.cpf, scenario.cpf);
    await fillByIdVerified(page, NOVO_IDS.dataNascimento, scenario.dataNascimento);

    screenshotUrl = await captureScreenshot(page, 'B', config.capturarScreenshots);
    await clickContinuarCompra(page);

    try {
      await waitForRoute(page, NOVO_ROUTES.ENDERECO, config.timeoutPorStepMs);
    } catch {
      const erros = await coletarErrosValidacao(page);
      const detalhe = erros.length
        ? `Tatico; form invalido na etapa Dados: ${erros.join(', ')}`
        : 'Tatico; sem avanco apos Continuar compra (rota /endereco nao chegou)';
      return makeResult('fail', start, screenshotUrl, detalhe);
    }

    // O avanco da etapa Dados grava um lead parcial no backend (asbb2c):
    // "102|<leadId>|<marcador>|<ms>". Serve como confirmacao secundaria.
    const lead = net.getTaticoLead();
    const viaApi = lead ? `; asbb2c ${lead.codigo}|${lead.marcador} lead=${lead.leadId ?? 'n/a'}` : '';

    return makeResult('ok', start, screenshotUrl, `Tatico; etapa Dados submetida; rota /endereco${viaApi}`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `Tatico; erro: ${e.message}`);
  }
}

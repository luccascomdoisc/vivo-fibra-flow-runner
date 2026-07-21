import { NOVO_IDS } from '../../lib/constants.js';
import { fillByIdVerified, makeResult, sleep } from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [FLUXO NOVO] Checkpoint B - Dados pessoais/endereco: preenche o CEP, aguarda o
 * AUTOFILL assincrono (endereco, bairro, UF e cidade chegam sozinhos) e preenche
 * o numero. Cobre o mesmo dominio funcional do antigo A(CEP)+C(endereco).
 */
export async function runB_novo(ctx) {
  const { page, scenario, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    await fillByIdVerified(page, NOVO_IDS.cep, scenario.cep);

    // Autofill assincrono do CEP: espera o campo Endereco ganhar valor.
    const deadline = Date.now() + config.timeoutPorStepMs;
    let endereco = '';
    while (Date.now() < deadline) {
      endereco = await page.locator(`[id="${NOVO_IDS.endereco}"]`).inputValue().catch(() => '');
      if (endereco.trim()) break;
      await sleep(400);
    }
    if (!endereco.trim()) {
      screenshotUrl = await captureScreenshot(page, 'B', config.capturarScreenshots);
      return makeResult('fail', start, screenshotUrl, `fluxo novo; autofill do CEP nao ocorreu (viabilidade?)`);
    }

    await fillByIdVerified(page, NOVO_IDS.numero, scenario.numeroResidencia);
    screenshotUrl = await captureScreenshot(page, 'B', config.capturarScreenshots);

    return makeResult('ok', start, screenshotUrl, `fluxo novo; autofill ok ("${endereco.slice(0, 40)}")`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `fluxo novo; erro: ${e.message}`);
  }
}

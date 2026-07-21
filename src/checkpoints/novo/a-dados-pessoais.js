import { NOVO_IDS } from '../../lib/constants.js';
import { waitForHydration, fillByIdVerified, makeResult } from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [FLUXO NOVO] Checkpoint A - Cadastro inicial: garante a hidratacao do checkout
 * e preenche os dados pessoais (nome, celular, CPF, nascimento) da etapa "Dados".
 * Nao ha submit aqui: o fluxo novo funde tudo numa tela so; o avanco e no C.
 */
export async function runA_novo(ctx) {
  const { page, scenario, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    // Regra 1 do fluxo novo: NUNCA interagir antes da hidratacao (interacoes caem
    // no vazio, sem erro — era exatamente o sintoma dos prints "vazios" do monitor).
    await waitForHydration(page, `[id="${NOVO_IDS.nome}"]`, { timeout: config.timeoutPorStepMs });
    screenshotUrl = await captureScreenshot(page, 'A', config.capturarScreenshots);

    await fillByIdVerified(page, NOVO_IDS.nome, scenario.nome);
    await fillByIdVerified(page, NOVO_IDS.celular, scenario.celular);
    await fillByIdVerified(page, NOVO_IDS.cpf, scenario.cpf);
    await fillByIdVerified(page, NOVO_IDS.dataNascimento, scenario.dataNascimento);

    return makeResult('ok', start, screenshotUrl, 'fluxo novo; hidratado; dados pessoais ok');
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `fluxo novo; erro: ${e.message}`);
  }
}

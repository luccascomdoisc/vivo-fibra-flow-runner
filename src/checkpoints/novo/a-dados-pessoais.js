import { NOVO_IDS } from '../../lib/constants.js';
import { waitForHydration, fillByIdVerified, esperarViaCep, makeResult } from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [INFINITY] Checkpoint A - Cadastro inicial: garante a hidratacao e preenche a
 * primeira metade da etapa "Dados" (/checkouts/fibra/dados): nome, celular, CEP
 * e numero. Mesmo escopo do A do Tatico, que tambem pegava nome/celular/CEP/nº.
 *
 * Sobre o CEP: digitar o CEP dispara um GET em viacep.com.br, que e quem alimenta
 * o autofill de endereco/bairro/cidade/UF exibido na etapa seguinte. O checkout
 * Infinity NAO consulta cobertura FTTH em nenhum momento (verificado nas duas
 * capturas de 21/08: nenhuma chamada de viabilidade) — a cobertura e avaliada
 * entre o pedido e a aprovacao da venda, fora do site. Portanto este checkpoint
 * mede autofill, nao cobertura.
 */
export async function runA_novo(ctx) {
  const { page, net, scenario, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;

  try {
    // Regra 1 do Infinity: NUNCA interagir antes da hidratacao (interacoes caem no
    // vazio, sem erro — era o sintoma dos prints "vazios" do monitor).
    await waitForHydration(page, `[id="${NOVO_IDS.nome}"]`, { timeout: config.timeoutPorStepMs });

    await fillByIdVerified(page, NOVO_IDS.nome, scenario.nome);
    await fillByIdVerified(page, NOVO_IDS.celular, scenario.celular);
    await fillByIdVerified(page, NOVO_IDS.cep, scenario.cep);

    const via = await esperarViaCep(net, Math.min(config.timeoutPorStepMs, 15000));

    // O numero fica na etapa Dados (e reaparece preenchido na etapa Endereco).
    await fillByIdVerified(page, NOVO_IDS.numero, scenario.numeroResidencia);
    screenshotUrl = await captureScreenshot(page, 'A', config.capturarScreenshots);

    // Diagnostico do autofill separando as tres causas possiveis de problema:
    // terceiro fora do ar, CEP mal escolhido no pool, ou tudo ok.
    if (!via) {
      return makeResult('fail', start, screenshotUrl, 'Infinity; DEPENDENCIA EXTERNA: ViaCEP nao respondeu (autofill de endereco nao vai acontecer)');
    }
    if (via.status !== 200 || via.erro) {
      return makeResult('fail', start, screenshotUrl, `Infinity; DEPENDENCIA EXTERNA: ViaCEP HTTP ${via.status}${via.erro ? ' (CEP inexistente)' : ''}`);
    }
    if (!via.temLogradouro) {
      return makeResult('fail', start, screenshotUrl, `Infinity; CONFIG: CEP ${scenario.cep} e CEP geral (ViaCEP sem logradouro) — o autofill vem vazio e o form trava. Trocar o CEP do pool.`);
    }

    return makeResult('ok', start, screenshotUrl, `Infinity; hidratado; dados+CEP+numero ok; viacep ok (${via.cidade}/${via.uf})`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `Infinity; erro: ${e.message}`);
  }
}

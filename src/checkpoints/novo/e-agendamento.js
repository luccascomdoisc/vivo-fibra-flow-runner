import { NOVO_IDS, NOVO_NAMES } from '../../lib/constants.js';
import { fillByIdVerified, makeResult, marcarPorName, sleep } from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [TATICO] Checkpoint E - Agendamento (/checkouts/fibra/agendamento): vencimento
 * da fatura, e-mail da fatura digital (no Infinity o e-mail ficava na tela B),
 * duas datas de instalacao (selects nativos com value ISO), periodos e termos.
 *
 * Armadilhas confirmadas na recaptura 21/08:
 *  - Os dois grupos de periodo REPETEM os ids #manha/#tarde; so o name distingue
 *    (periodoAgendamentoEquipamento vs PeriodoAgendamentoEquipamento2).
 *  - O checkbox de termos nao tem id -> localizar por name="optInTerms".
 *  - A tela consulta brasilapi.com.br/api/feriados para montar as datas: se esse
 *    terceiro cair, a lista vem vazia sem culpa da Vivo.
 */
export async function runE_novo(ctx) {
  const { page, net, config } = ctx;
  const { scenario } = ctx;
  const start = Date.now();
  let screenshotUrl = null;
  const notas = [];

  try {
    // Dia de vencimento: primeiro do grupo (01 ja vem marcado por padrao).
    const vencOk = await marcarPorName(page, NOVO_NAMES.vencimento).catch(() => false);
    if (!vencOk) notas.push('vencimento nao selecionado');

    await fillByIdVerified(page, NOVO_IDS.email, scenario.email);

    // Datas de instalacao: selects nativos, values ISO (yyyy-mm-dd).
    const sel1 = page.locator(`[id="${NOVO_IDS.dataInstalacao1}"]`);
    const sel2 = page.locator(`[id="${NOVO_IDS.dataInstalacao2}"]`);
    const opcoes1 = await sel1.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    const opcoes2 = await sel2.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    if (!opcoes1.length || !opcoes2.length) {
      const fer = net.getFeriados();
      const causa = fer && fer.status !== 200
        ? `DEPENDENCIA EXTERNA: brasilapi/feriados HTTP ${fer.status}`
        : 'sem datas de instalacao disponiveis no select';
      screenshotUrl = await captureScreenshot(page, 'E', config.capturarScreenshots);
      return makeResult('fail', start, screenshotUrl, `Tatico; ${causa}`);
    }
    await sel1.selectOption(opcoes1[0]);
    await sel2.selectOption(opcoes2[1] ?? opcoes2[0]); // 2a data preferida (datas distintas)
    await sleep(300);

    // Periodos: "Manha" ja vem marcada nos dois grupos; garante por name.
    await marcarPorName(page, NOVO_NAMES.periodo1, 'manha').catch(() => {});
    await marcarPorName(page, NOVO_NAMES.periodo2, 'manha').catch(() => {});

    // Termos: obrigatorio para o submit final. Sem id -> por name.
    let termosOk = await marcarPorName(page, NOVO_NAMES.termos).catch(() => false);
    if (!termosOk) {
      // ultimo recurso: clique fisico a esquerda do texto (padrao visual do site)
      const label = page.locator('text=Estou ciente e concordo').first();
      const box = await label.boundingBox().catch(() => null);
      if (box) await page.mouse.click(box.x - 16, box.y + box.height / 2);
      termosOk = await page.locator(`input[name="${NOVO_NAMES.termos}"]`).first().isChecked().catch(() => false);
    }

    screenshotUrl = await captureScreenshot(page, 'E', config.capturarScreenshots);

    return makeResult(
      termosOk ? 'ok' : 'fail',
      start,
      screenshotUrl,
      `Tatico; datas=${opcoes1[0]}/${opcoes2[1] ?? opcoes2[0]}; termos=${termosOk ? 'ok' : 'NAO marcado'}; ${notas.join(' | ') || 'periodos ok'}`,
    );
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `Tatico; erro: ${e.message}`);
  }
}

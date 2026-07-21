import { NOVO_IDS } from '../../lib/constants.js';
import { fillByIdVerified, makeResult, sleep } from '../../lib/checkpoint.js';
import { captureScreenshot } from '../../lib/screenshot.js';

/**
 * [FLUXO NOVO] Checkpoint E - Agendamento: vencimento da fatura, e-mail da fatura
 * digital (o e-mail MUDOU de tela: no antigo ficava no B), duas datas de instalacao
 * (selects nativos com value ISO yyyy-mm-dd), periodos e aceite de termos.
 *
 * Ao contrario do antigo (dropdowns custom fragilissimos), aqui sao <select> nativos:
 * selectOption resolve. "Manha" ja vem pre-selecionada nos dois grupos de periodo.
 */
export async function runE_novo(ctx) {
  const { page, scenario, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;
  const notas = [];

  try {
    // Dia de vencimento: primeiro radio do grupo (ids sao os proprios dias: 01, 06...).
    const radios = page.locator('input[name="dataVencimentoConta"]');
    if ((await radios.count().catch(() => 0)) > 0) {
      await radios.first().click({ force: true }).catch(async () => {
        // fallback: clica no label irmao (componente estilizado)
        await page.locator('label', { hasText: /^0?1$/ }).first().click().catch(() => notas.push('vencimento nao selecionado'));
      });
    } else {
      notas.push('radios de vencimento nao encontrados');
    }

    await fillByIdVerified(page, NOVO_IDS.email, scenario.email);

    // Datas de instalacao: selects nativos; 1a opcao valida em cada um (values ISO).
    const sel1 = page.locator(`[id="${NOVO_IDS.dataInstalacao1}"]`);
    const sel2 = page.locator(`[id="${NOVO_IDS.dataInstalacao2}"]`);
    const opcoes1 = await sel1.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    await sel1.selectOption(opcoes1[0]);
    const opcoes2 = await sel2.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    await sel2.selectOption(opcoes2[1] ?? opcoes2[0]); // 2a opcao preferida (datas distintas)
    await sleep(300);

    // Periodos: "Manha" ja vem marcada nos dois grupos; garante por via das duvidas.
    for (const grupo of ['periodoAgendamentoEquipamento']) {
      await page.locator(`input[name="${grupo}"]`).first().click({ force: true }).catch(() => {});
    }

    // Termos: checkbox obrigatorio antes do submit (sem ele o pedido nao conclui).
    const termos = page.locator('input[type="checkbox"]').last();
    const marcado = await termos.isChecked().catch(() => false);
    if (!marcado) {
      await termos.click({ force: true }).catch(async () => {
        const label = page.locator('text=Estou ciente e concordo').first();
        const box = await label.boundingBox();
        if (box) await page.mouse.click(box.x - 16, box.y + box.height / 2);
      });
    }
    const termosOk = await termos.isChecked().catch(() => false);

    screenshotUrl = await captureScreenshot(page, 'E', config.capturarScreenshots);

    return makeResult(
      termosOk ? 'ok' : 'fail',
      start,
      screenshotUrl,
      `fluxo novo; datas=${opcoes1[0]}/${opcoes2[1] ?? opcoes2[0]}; termos=${termosOk ? 'ok' : 'NAO marcado'}; ${notas.join(' | ') || 'periodos ok'}`,
    );
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `fluxo novo; erro: ${e.message}`);
  }
}

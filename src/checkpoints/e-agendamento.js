import { ANCHORS } from '../lib/constants.js';
import { waitForText, sleep, makeResult } from '../lib/checkpoint.js';
import { captureScreenshot } from '../lib/screenshot.js';

/**
 * Checkpoint E - Agendamento: dia de vencimento + 2 datas + 2 periodos.
 * Sem POST imediato (estado client-side ate o submit do step F).
 * OK = botao "Concluir pedido" visivel apos preencher.
 *
 * >>> ETAPA MAIS FRAGIL <<<
 * As datas/periodos sao selects dinamicos cujo conteudo muda a cada dia. A heuristica
 * abaixo (abrir cada dropdown e pegar a 1a opcao; periodo = Manha) e um ponto de partida
 * que muito provavelmente sera ajustado apos os primeiros runs reais na Apify, com base
 * no DOM observado. A validacao definitiva de E vem do sucesso do submit no checkpoint F.
 */
export async function runE(ctx) {
  const { page, config } = ctx;
  const start = Date.now();
  let screenshotUrl = null;
  const notas = [];

  try {
    await waitForText(page, ANCHORS.E, config.timeoutPorStepMs);
    screenshotUrl = await captureScreenshot(page, 'E', config.capturarScreenshots);

    const selecionados = await selecionarDropdownsEmSequencia(page, notas);
    await escolherPeriodo(page, notas, { indice: 0 });
    await escolherPeriodo(page, notas, { indice: 1 });

    const btn = page.getByText('Concluir pedido', { exact: false }).first();
    await btn.waitFor({ state: 'visible', timeout: config.timeoutPorStepMs });

    return makeResult('ok', start, screenshotUrl, `agendamento: ${selecionados} dropdowns; ${notas.join(' | ') || 'ok'}`);
  } catch (e) {
    return makeResult('fail', start, screenshotUrl, `erro: ${e.message}`);
  }
}

/** Abre cada dropdown da secao e escolhe a 1a opcao disponivel. */
async function selecionarDropdownsEmSequencia(page, notas) {
  let count = 0;
  const openers = page.locator(
    '[role="combobox"], [aria-haspopup="listbox"], [data-testid="Dropdown"]',
  );
  const n = await openers.count().catch(() => 0);

  for (let i = 0; i < n; i++) {
    try {
      const opener = openers.nth(i);
      await opener.scrollIntoViewIfNeeded();
      await opener.click();
      const option = page.locator('ul[role="listbox"] li, ul li, [role="option"]').first();
      await option.waitFor({ state: 'visible', timeout: 4000 });
      await option.click();
      count++;
      await sleep(300);
    } catch {
      notas.push(`dropdown[${i}] pulado`);
    }
  }
  return count;
}

/** Seleciona um radio de periodo (Manha preferida; Tarde como fallback). */
async function escolherPeriodo(page, notas, { indice = 0 } = {}) {
  for (const label of ['Manhã', 'Tarde']) {
    try {
      const el = page.getByText(label, { exact: false }).nth(indice);
      await el.waitFor({ state: 'visible', timeout: 2000 });
      await el.click();
      return;
    } catch {
      /* tenta proximo label */
    }
  }
  notas.push(`periodo[${indice}] nao selecionado`);
}

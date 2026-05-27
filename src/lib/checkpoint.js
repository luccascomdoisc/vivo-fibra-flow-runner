// Helpers compartilhados pelos checkpoints de browser (A..F).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (min, max) => Math.floor(min + Math.random() * (max - min));

/** Monta o objeto-resultado padronizado de um checkpoint. */
export function makeResult(status, start, screenshotUrl = null, detalhe = null) {
  return { status, durationMs: Date.now() - start, screenshotUrl, detalhe };
}

/**
 * Resolve um campo de formulario pelo nome acessivel, tentando varias estrategias.
 * IDs React (#:r1f:) mudam entre sessoes -> NUNCA usar como primario.
 */
async function resolveField(page, name, timeout) {
  const candidates = [
    page.getByLabel(name, { exact: false }),
    page.getByRole('textbox', { name }),
    page.getByPlaceholder(name),
  ];
  for (const loc of candidates) {
    const el = loc.first();
    try {
      await el.waitFor({ state: 'visible', timeout: Math.min(timeout, 8000) });
      return el;
    } catch {
      /* tenta proxima estrategia */
    }
  }
  throw new Error(`campo nao encontrado: ${name}`);
}

/** Preenche um campo digitando caractere a caractere (dispara mascaras React + parece humano). */
export async function fillField(page, name, value, { timeout = 15000 } = {}) {
  const el = await resolveField(page, name, timeout);
  await el.click();
  await el.press('Control+a').catch(() => {});
  await el.press('Delete').catch(() => {});
  await el.pressSequentially(String(value ?? ''), { delay: jitter(40, 90) });
}

/** Clica um botao por rotulo, com fallback para o data-testid usado pela Vivo e por texto. */
export async function clickButton(page, label, { timeout = 15000 } = {}) {
  const candidates = [
    page.getByRole('button', { name: label }),
    page.locator("[data-testid='Text3']").filter({ hasText: label }),
    page.getByText(label, { exact: true }),
  ];
  for (const loc of candidates) {
    const el = loc.first();
    try {
      await el.waitFor({ state: 'visible', timeout: Math.min(timeout, 8000) });
      await el.click();
      return;
    } catch {
      /* tenta proxima estrategia */
    }
  }
  throw new Error(`botao nao encontrado: ${label}`);
}

/** Clica um elemento pela substring de texto (ex.: opcao "Edificio", "Manha"). */
export async function clickByText(page, text, { timeout = 8000 } = {}) {
  const el = page.getByText(text, { exact: false }).first();
  await el.waitFor({ state: 'visible', timeout });
  await el.click();
}

/** Aguarda um texto/regex ficar visivel. */
export async function waitForText(page, pattern, timeout) {
  await page.getByText(pattern).first().waitFor({ state: 'visible', timeout });
}

/**
 * Considera o checkpoint "OK" se a ancora da proxima tela aparecer (DOM, primario)
 * OU se o POST /asb daquele SubType voltar 200 (network, confirmatorio).
 * Retorna 'anchor' | 'asb' | null.
 */
export async function waitOkSignal(page, net, { nextAnchor = null, subType = null, timeout }) {
  const deadline = Date.now() + timeout;

  const anchorPromise = nextAnchor
    ? waitForText(page, nextAnchor, timeout)
        .then(() => 'anchor')
        .catch(() => null)
    : Promise.resolve(null);

  const asbPromise = (async () => {
    if (!subType) return null;
    while (Date.now() < deadline) {
      const a = net.getAsb(subType);
      if (a && (a.innerStatus === 200 || a.status === 200)) return 'asb';
      await sleep(300);
    }
    return null;
  })();

  return Promise.race([anchorPromise, asbPromise]);
}

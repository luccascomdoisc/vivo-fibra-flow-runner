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

// ---------------------------------------------------------------------------
// Helpers do FLUXO NOVO (internet.vivo.com.br/checkouts/fibra) — jul/2026.
// O checkout novo e um SPA Next.js com inputs React controlados por onChange e
// IDs estaveis e semanticos (#Name, #Phone, #cpf, ...). Regras aprendidas no
// mapeamento manual (ver docs/FLUXO-NOVO.md):
//  1. Interacoes ANTES da hidratacao sao silenciosamente ignoradas (sem erro).
//  2. Atribuicao direta de .value NAO registra no estado React -> digitar de verdade.
//  3. Classes CSS sao hasheadas por build -> NUNCA usar como seletor.
//  4. O botao de avanco tem title ERRADO ("Volte para o passo anterior") -> localizar
//     pelo texto "Continuar compra", nunca por title/aria.
// ---------------------------------------------------------------------------

/**
 * Aguarda a hidratacao do React em um elemento (as props __reactProps$ so existem
 * depois que o React "assumiu" o DOM). Sem isso, digitacao e clique caem no vazio.
 */
export async function waitForHydration(page, selector, { timeout = 30000 } = {}) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps$'));
    },
    selector,
    { timeout },
  );
}

/**
 * Preenche um campo do fluxo novo POR ID, com verificacao e retry.
 * Digita caractere a caractere (mascaras React) e confere que o valor "pegou"
 * (sintoma classico de pagina nao-hidratada: campo continua vazio, sem erro).
 */
export async function fillByIdVerified(page, id, value, { timeout = 15000, tentativas = 3 } = {}) {
  const sel = `[id="${id}"]`; // atributo (nao #id): ids com acento, ex. "Edifício"
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout });

  const digitos = String(value ?? '').replace(/\D/g, '');
  for (let i = 1; i <= tentativas; i++) {
    await el.click();
    await el.press('Control+a').catch(() => {});
    await el.press('Delete').catch(() => {});
    await el.pressSequentially(String(value ?? ''), { delay: jitter(40, 90) });

    const dom = await el.inputValue().catch(() => '');
    const domDigitos = dom.replace(/\D/g, '');
    const ok = digitos.length > 0 ? domDigitos === digitos : dom.trim() === String(value ?? '').trim();
    if (ok) return;

    await sleep(700 * i); // pagina provavelmente ainda hidratando; espera e tenta de novo
  }
  throw new Error(`campo #${id} nao reteve o valor (pagina nao hidratada?)`);
}

/**
 * Clica o botao de avanco do fluxo novo pelo TEXTO "Continuar compra".
 * (title/aria do botao estao errados no site; ver regra 4 acima.)
 */
export async function clickContinuarCompra(page, { timeout = 15000 } = {}) {
  const btn = page.locator('button', { hasText: 'Continuar compra' }).first();
  await btn.waitFor({ state: 'visible', timeout });
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click();
}

/**
 * Coleta mensagens de validacao inline visiveis do fluxo novo (ex.: "Campo
 * obrigatorio", "CPF invalido"). Uteis no detalhe de falha para diferenciar
 * "form invalido" de "site fora do ar".
 */
export async function coletarErrosValidacao(page) {
  try {
    const body = await page.locator('body').innerText({ timeout: 2000 });
    const conhecidos = ['Campo obrigatório', 'CPF inválido', 'Telefone inválido', 'Formato da data inválido', 'E-mail inválido'];
    return conhecidos.filter((m) => body.includes(m));
  } catch {
    return [];
  }
}

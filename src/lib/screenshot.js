import { Actor, log } from 'apify';

/**
 * Captura screenshot full-page e grava no Key-Value Store padrao do run,
 * retornando a URL publica para o relatorio.
 */
export async function captureScreenshot(page, cpId, enabled = true) {
  if (!enabled) return null;
  try {
    const buffer = await page.screenshot({ fullPage: true });
    const key = `cp-${cpId}-${Date.now()}.png`;
    const store = await Actor.openKeyValueStore();
    await store.setValue(key, buffer, { contentType: 'image/png' });
    return store.getPublicUrl(key);
  } catch (e) {
    log.warning(`Falha ao capturar screenshot ${cpId}: ${e.message}`);
    return null;
  }
}

/**
 * Coleta evidencia da tela que quebrou: screenshot + URL final (pos-redirect) +
 * titulo + trecho do texto visivel. Usado pelo orquestrador quando um checkpoint
 * falha sem ter capturado seu proprio screenshot — sem isso a falha sai "cega"
 * (so dataset, sem acesso ao log do run).
 */
export async function captureFailureContext(page, cpId, enabled = true) {
  const out = { screenshotUrl: null, url: null, title: null, snippet: null };
  try {
    out.url = page.url();
  } catch {
    /* page pode estar fechada */
  }
  try {
    out.title = await page.title();
  } catch {
    /* opcional */
  }
  try {
    const text = await page.locator('body').innerText({ timeout: 3000 });
    out.snippet = text.replace(/\s+/g, ' ').trim().slice(0, 800);
  } catch {
    /* opcional */
  }
  out.screenshotUrl = await captureScreenshot(page, `${cpId}-fail`, enabled).catch(() => null);
  return out;
}

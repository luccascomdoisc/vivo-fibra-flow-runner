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

import { sleep, makeResult } from '../lib/checkpoint.js';

/**
 * Checkpoint D - Validacao de credito (Topaz): invisivel ao usuario, disparada
 * automaticamente apos o step C. Aqui so OBSERVAMOS o resultado interceptado.
 *
 * - score 0 (ou ausente) e status 201 -> ok
 * - score > 0 -> warn (registra topazScore), mas NAO interrompe o fluxo
 * - chamada nao observada -> ok com nota (e observacional, nao falha o funil)
 */
export async function runD(ctx) {
  const { net, state, config } = ctx;
  const start = Date.now();
  const deadline = Date.now() + Math.min(config.timeoutPorStepMs, 8000);

  let t = net.getTopaz();
  while (!t && Date.now() < deadline) {
    await sleep(300);
    t = net.getTopaz();
  }

  if (!t) {
    return makeResult('ok', start, null, 'topaz nao interceptado (observacional)');
  }

  state.topazScore = t.score;

  if (t.status === 201 && (t.score === 0 || t.score === null)) {
    return makeResult('ok', start, null, `topaz ${t.status} score=${t.score}`);
  }
  return makeResult('warn', start, null, `topaz ${t.status} score=${t.score}`);
}

import { Actor, log } from 'apify';
import { runFlow } from './flow.js';

await Actor.init();

try {
  const input = (await Actor.getInput()) ?? {};
  if (!input.scenario) {
    throw new Error('Input invalido: o campo "scenario" e obrigatorio.');
  }

  const output = await runFlow(input);

  await Actor.pushData(output);
  await Actor.setValue('OUTPUT', output);
  log.info(`Fluxo concluido. failedAt=${output.failedAt ?? 'null'} leadId=${output.leadId ?? 'null'}`);
} catch (e) {
  // Garante que SEMPRE haja um relatorio, mesmo em falha fatal (CA-NF-01).
  log.exception(e, 'Falha fatal no Actor');
  const fallback = {
    runStartedAt: new Date().toISOString(),
    runFinishedAt: new Date().toISOString(),
    scenario: null,
    checkpoints: [],
    failedAt: null,
    leadId: null,
    orderNumber: null,
    topazScore: null,
    error: `Falha fatal: ${e.message}`,
  };
  await Actor.pushData(fallback);
  await Actor.setValue('OUTPUT', fallback);
} finally {
  await Actor.exit();
}

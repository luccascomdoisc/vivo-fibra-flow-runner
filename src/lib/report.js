import { maskCpf } from './mask.js';
import { CHECKPOINTS } from './constants.js';

/** Cria os 7 checkpoints como 'skipped' (estado inicial). */
export function emptyResults() {
  return CHECKPOINTS.map((c) => ({
    id: c.id,
    nome: c.nome,
    status: 'skipped',
    durationMs: null,
    screenshotUrl: null,
    detalhe: null,
  }));
}

/** Monta o ActorOutput final (contrato com o n8n). CPF sempre mascarado. */
export function buildOutput({
  runStartedAt,
  results,
  leadId = null,
  orderNumber = null,
  topazScore = null,
  error = null,
  scenario,
}) {
  return {
    runStartedAt,
    runFinishedAt: new Date().toISOString(),
    scenario: {
      cep: scenario?.cep ?? null,
      cpf: maskCpf(scenario?.cpf),
    },
    checkpoints: results,
    failedAt: results.find((r) => r.status === 'fail')?.id ?? null,
    leadId,
    orderNumber,
    topazScore,
    error,
  };
}

// Utilitarios de mascara/sanitizacao de dados pessoais (LGPD: CPF nunca em claro no output).

/** Mascara CPF para log: "738.854.920-08" -> "738.***.***-08". */
export function maskCpf(cpf) {
  const d = String(cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return '***';
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

/** Mantem apenas digitos (o BFF da Vivo recebe CPF/CEP sem mascara). */
export function onlyDigits(s) {
  return String(s ?? '').replace(/\D/g, '');
}

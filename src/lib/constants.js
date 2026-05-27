// Constantes do fluxo Vivo Fibra. Fonte: CHECKPOINTS.md + analise dos HARs.

export const CATALOG_URL =
  'https://plataforma.portal.vivo.com.br/catalog/main/b2c/total.json';

export const CADASTRO_BASE =
  'https://loja.vivo.com.br/produtos-vivo/cadastro/vivofibra';

// Path do BFF transacional (host: loja.vivo.com.br).
export const BFF_PREFIX = '/unicommerceTacticalB2CBff/v1/';

// Ordem oficial dos checkpoints e nome legivel.
export const CHECKPOINTS = [
  { id: 'Z', nome: 'Landing Page' },
  { id: 'A', nome: 'Cadastro inicial' },
  { id: 'B', nome: 'Dados pessoais' },
  { id: 'C', nome: 'Endereco de instalacao' },
  { id: 'D', nome: 'Validacao de credito (Topaz)' },
  { id: 'E', nome: 'Agendamento' },
  { id: 'F', nome: 'Confirmacao' },
];

// Texto-chave (ancora) estavel de cada tela. NAO usar copy promocional volatil.
// A ancora de uma etapa serve para validar que a etapa ANTERIOR avancou.
export const ANCHORS = {
  A: 'Informe seus dados pessoais',
  B: 'Dados pessoais',
  C: 'Endereço de instalação da fibra',
  E: 'Agendar instalação',
  F: /Deu certo!?\s*O seu pedido[\s\S]*?foi recebido/i,
};

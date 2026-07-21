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

// ---------------------------------------------------------------------------
// FLUXO NOVO (jul/2026): checkout Next.js em internet.vivo.com.br/checkouts/fibra.
// A URL antiga de cadastro redireciona para ca quando o fluxo novo esta ativo;
// o fluxo antigo (acima) segue existindo como contingencia.
// ---------------------------------------------------------------------------

export const NOVO_URL_MARKER = '/checkouts/fibra';

// Ancoras de tela do fluxo novo (textos estaveis; nunca classes CSS hasheadas).
export const ANCHORS_NOVO = {
  DADOS: 'vamos iniciar sua compra online',
  AGENDAMENTO: 'agende a instalação',
  SUCESSO: 'Pedido realizado com sucesso',
};

// IDs estaveis dos campos do fluxo novo (etapa Dados).
export const NOVO_IDS = {
  nome: 'Name',
  celular: 'Phone',
  cpf: 'cpf',
  dataNascimento: 'dataNascimento',
  cep: 'Cep',
  endereco: 'enderecoCobranca',
  numero: 'Numero',
  bairro: 'Bairro',
  uf: 'UF',
  cidade: 'Cidade',
  complemento: 'Complemento',
  andar: 'Extra3', // campo "Andar" (so existe com tipo de imovel = Edificio)
  referencia: 'EntregaPontoReferencia',
  // etapa Agendamento
  email: 'Mail',
  dataInstalacao1: 'dataAgendamentoEquipamento',
  dataInstalacao2: 'DataAgendamentoEquipamento2', // capitalizacao inconsistente e do site mesmo
};

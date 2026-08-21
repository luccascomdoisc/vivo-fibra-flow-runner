// Constantes do fluxo Vivo Fibra.
// Fontes: CHECKPOINTS.md (Infinity) + docs/FLUXO-NOVO.md (Tatico, recaptura 21/08/2026).

export const CATALOG_URL =
  'https://plataforma.portal.vivo.com.br/catalog/main/b2c/total.json';

export const CADASTRO_BASE =
  'https://loja.vivo.com.br/produtos-vivo/cadastro/vivofibra';

// Path do BFF transacional do Infinity (host: loja.vivo.com.br).
export const BFF_PREFIX = '/unicommerceTacticalB2CBff/v1/';

// ---------------------------------------------------------------------------
// Nomes de negocio dos dois fluxos de Fibra (a Vivo os chama assim).
// Vao para debug.flow.nome e devem ser o rotulo usado no alerta do n8n.
//  - Tatico   = BAU. Checkout novo, internet.vivo.com.br/checkouts/fibra.
//  - Infinity = contingencia, quando o BAU da problema. loja.vivo.com.br + asb.
// Cuidado com a pegadinha: o BFF do Infinity se chama "unicommerceTactical" e a
// LP carrega id_origem_vivo=TaticoLP — ali "Tatico" e a LP de midia, nao a
// plataforma de checkout.
// ---------------------------------------------------------------------------
export const FLOW_LABELS = {
  novo: 'Tático',
  antigo: 'Infinity',
  desconhecido: 'desconhecido',
  bloqueado_akamai: 'bloqueado (Akamai)',
};

// Ordem oficial dos checkpoints e nome legivel (contrato com o n8n — nao mexer).
export const CHECKPOINTS = [
  { id: 'Z', nome: 'Landing Page' },
  { id: 'A', nome: 'Cadastro inicial' },
  { id: 'B', nome: 'Dados pessoais' },
  { id: 'C', nome: 'Endereco de instalacao' },
  { id: 'D', nome: 'Validacao de credito (Topaz)' },
  { id: 'E', nome: 'Agendamento' },
  { id: 'F', nome: 'Confirmacao' },
];

// Texto-chave (ancora) estavel de cada tela do INFINITY. NAO usar copy promocional.
// A ancora de uma etapa serve para validar que a etapa ANTERIOR avancou.
export const ANCHORS = {
  A: 'Informe seus dados pessoais',
  B: 'Dados pessoais',
  C: 'Endereço de instalação da fibra',
  E: 'Agendar instalação',
  F: /Deu certo!?\s*O seu pedido[\s\S]*?foi recebido/i,
};

// ---------------------------------------------------------------------------
// FLUXO TATICO (checkout Next.js em internet.vivo.com.br/checkouts/fibra).
// A URL de cadastro do Infinity redireciona para ca quando o Tatico esta ativo;
// o Infinity segue existindo como contingencia.
// ---------------------------------------------------------------------------

export const NOVO_URL_MARKER = '/checkouts/fibra';

// Recaptura 21/08/2026: o Tatico tem 4 etapas e CADA UMA TEM ROTA PROPRIA.
// A rota e o sinal de avanco mais forte que existe aqui — o <h1> e identico nas
// quatro telas ("Ola, vamos iniciar sua compra online"), entao texto de tela NAO
// serve para distinguir etapa (era o erro do mapeamento de julho).
export const NOVO_ROUTES = {
  DADOS: '/checkouts/fibra/dados',
  ENDERECO: '/checkouts/fibra/endereco',
  AGENDAMENTO: '/checkouts/fibra/agendamento',
  CONFIRMACAO: '/checkouts/fibra/confirmacao/',
};

// Backend transacional do Tatico (substitui o /asb do Infinity).
// Resposta observada: {"response":{"status":200,"result":"102|64044654|DUPLICADO| 0.02"}}
// e, antes de cada transacao, um {"result":{"token":"<jwt>"}} (auth — nunca logar).
export const TATICO_API_MARKER = 'asbb2c.accenture.com/api';

// Dependencias de TERCEIRO usadas pelo checkout. Se uma delas cai, a tela quebra
// sem ser culpa da Vivo — o alerta precisa distinguir isso de "funil quebrado".
export const VIACEP_MARKER = 'viacep.com.br/ws/'; // autofill de endereco (etapa Dados)
export const FERIADOS_MARKER = 'brasilapi.com.br/api/feriados'; // datas (etapa Agendamento)

// Hosts nao-Vivo que interessam no buffer de debug.apiCalls.
export const HOSTS_API_EXTRA = /(asbb2c\.accenture\.com|viacep\.com\.br|brasilapi\.com\.br)$/i;

// Ancoras de texto do Tatico. So a de SUCESSO e confiavel (h1 muda nela);
// as demais existem apenas como reforco — quem manda e NOVO_ROUTES.
export const ANCHORS_NOVO = {
  DADOS: 'vamos iniciar sua compra online',
  SUCESSO: 'Pedido realizado com sucesso',
};

// IDs estaveis dos campos do Tatico (confirmados na recaptura de 21/08).
export const NOVO_IDS = {
  // etapa Dados (/dados) — 6 campos, sem endereco
  nome: 'Name',
  celular: 'Phone',
  cpf: 'cpf',
  dataNascimento: 'dataNascimento',
  cep: 'Cep',
  numero: 'Numero',
  // etapa Endereco (/endereco) — endereco/bairro/uf/cidade chegam do autofill ViaCEP
  endereco: 'enderecoCobranca',
  bairro: 'Bairro',
  uf: 'UF',
  cidade: 'Cidade',
  complemento: 'Complemento',
  andar: 'Extra3', // campo "Andar": so existe com tipo de imovel = Edificio
  referencia: 'EntregaPontoReferencia',
  // etapa Agendamento (/agendamento)
  email: 'Mail',
  dataInstalacao1: 'dataAgendamentoEquipamento',
  dataInstalacao2: 'DataAgendamentoEquipamento2', // capitalizacao inconsistente e do site
};

// Atributos name do Tatico. Necessarios porque varios controles NAO tem id unico:
// os radios de periodo repetem os ids #manha/#tarde nos dois grupos, e os
// checkboxes de termos e quadra/lote nao tem id nenhum.
export const NOVO_NAMES = {
  tipoImovel: 'tipoImovel', // valores "Casa" (default) e "Edifício"
  quadraLote: 'isQuadraLote',
  vencimento: 'dataVencimentoConta', // ids sao os dias: 01, 06, 10, 17, 21, 26
  periodo1: 'periodoAgendamentoEquipamento',
  periodo2: 'PeriodoAgendamentoEquipamento2',
  termos: 'optInTerms',
};

# Vivo Fibra — Mapeamento do fluxo novo de checkout

**URL:** `https://internet.vivo.com.br/checkouts/fibra/?id=<id>&offer=<offer>`
**Data do mapeamento:** 21/07/2026 (execução real completa, dados sintéticos)
**Stack:** Next.js App Router (React Server Components), 100% client-rendered após hidratação.

---

## Visão geral

3 etapas num stepper único, mesma URL (sem mudança de rota entre etapas):

1. **Dados** — dados pessoais + endereço completo numa única tela
2. **Agendamento** — vencimento da fatura, e-mail, 2 datas de instalação, período, aceite de termos
3. **Confirmação** — página de sucesso com resumo (o commit real acontece no submit da etapa 2)

---

## Etapa 1 — Dados

Todos os campos com **IDs estáveis e semânticos** (usar como seletores primários):

| Campo | Seletor | Observações |
|---|---|---|
| Nome completo | `#Name` | |
| Celular | `#Phone` | máscara `(11) 98175-0915` — digitar só dígitos |
| CPF | `#cpf` | minúsculo! máscara `462.862.950-11` |
| Data de nascimento | `#dataNascimento` | máscara `DD/MM/AAAA` |
| CEP | `#Cep` | **dispara autofill**: preenche Endereço, Bairro, UF e Cidade sozinho |
| Endereço | `#enderecoCobranca` | autofill — não sobrescrever |
| Número | `#Numero` | preencher manualmente |
| Bairro | `#Bairro` | autofill |
| Estado | `#UF` (select) | autofill; só 14 UFs no select |
| Cidade | `#Cidade` | autofill |
| Tipo do imóvel | radios `#Casa` / `#Edifício` (name `tipoImovel`) | **"Casa" vem pré-selecionado**. ID com acento em "Edifício" |
| Andar | `#Extra3` | **condicional — só existe com "Edifício" selecionado**. ID nada semântico |
| Complemento | `#Complemento` | |
| Referência | `#EntregaPontoReferencia` | |
| Quadra e lote | checkbox `[name="isQuadraLote"]` | marca → surgem campos Quadra/Lote |

**Botão avançar:** texto `Continuar compra`, `type="button"`, mas `title="Volte para o passo anterior"` (bug da Vivo — **não localizar por title/aria**; usar texto ou posição).

**Validação:** ao clicar com campos inválidos, aparecem mensagens inline: `Campo obrigatório`, `CPF inválido`, `Telefone inválido`, `Formato da data inválido` — bordas vermelhas + ícone de alerta. Útil como marcador de erro em screenshots.

## Etapa 2 — Agendamento

| Campo | Seletor | Observações |
|---|---|---|
| Vencimento da fatura | radios `#01 #06 #10 #17 #21 #26` (name `dataVencimentoConta`) | IDs numéricos |
| E-mail (fatura digital) | `#Mail` | **e-mail só existe nesta etapa** (no fluxo antigo ficava no scenario da etapa de cadastro) |
| Data instalação 1 | select `#dataAgendamentoEquipamento` | values ISO `2026-07-22` |
| Período 1 | radios `#manha` / `#tarde` (name `periodoAgendamentoEquipamento`) | "Manhã" pré-selecionado |
| Data instalação 2 | select `#DataAgendamentoEquipamento2` | capitalização inconsistente (D maiúsculo) |
| Período 2 | segundo grupo manhã/tarde | |
| Termos | checkbox antes do botão | obrigatório |

**Botão avançar:** texto `Continuar compra`, `type="submit"` (difere da etapa 1), mesmo title errado. **Este submit é o commit real do pedido.**

## Etapa 3 — Confirmação

Página de sucesso, sem interação. Marcadores para asserção:

- Heading: `Pedido realizado com sucesso! ✅`
- Bloco "Resumo do pedido" com todos os dados ecoados (produto, dados, agendamento)
- Heading secundário: `Sua solicitação está em análise!`
- Aviso de contato via WhatsApp (11) 99915-1515

---

## Armadilhas críticas para o Actor

1. **Hidratação:** interações logo após o load são **silenciosamente ignoradas** (clique não foca, digitação não registra, sem erro). Reproduzido em teste — é a explicação mais provável do print do bot com formulário vazio e sem alertas. Mitigação: após digitar, **verificar `el.value`; se vazio, aguardar e repetir** (retry-loop), ou aguardar marcador de hidratação antes da 1ª interação.
2. **Inputs React controlados por `onChange`:** atribuição direta de `value` via DOM não registra no estado. Usar digitação real (Playwright `type`/`fill`) ou native setter + `dispatchEvent('input')`.
3. **Classes CSS hasheadas por build** (`input_inputData__T4bNK` etc.) — mudam a cada deploy. Nunca usar como seletor. IDs são estáveis.
4. **`title` dos botões está errado** ("Volte para o passo anterior" em ambos os botões de avançar). Localizar por texto `Continuar compra`.
5. **Campos condicionais:** Andar (`#Extra3`) só com Edifício; Quadra/Lote só com checkbox marcado.
6. **Autofill do CEP é assíncrono** — aguardar `#enderecoCobranca` ter valor antes de avançar.
7. **Instabilidade do renderer:** durante o teste houve travamentos de captura (CDP timeout ~30s) mesmo com a página funcional. Prints do monitor podem falhar por isso, sem o fluxo estar quebrado.
8. **Backend aceita CPF sintético mod-11** — viabilidade do CEP validada no submit da etapa 1.

## Fluxo antigo (contingência) — referência da run 7nLsRilt7JQMhuHeY (16/07/2026, SUCCEEDED)

Checkpoints do Actor atual e telas correspondentes:

| CP | Nome | Tela |
|---|---|---|
| Z | Landing Page | Catálogo com cards de planos (18 cards); entrada via `link.href` / anchor |
| A | Cadastro inicial | "Informe seus dados pessoais": Nome, Celular, CEP (com busca + "Não sei o CEP"), Número + card Total/Continuar |
| B | Dados pessoais | CPF, Data de nascimento, **E-mail** + card Resumo/Continuar |
| C | Endereço de instalação | Endereço readonly (autofill do CEP) + quadra/lote + "Você mora em: Casa/Edifício" |
| D | Validação de crédito (Topaz) | Observacional (topaz não interceptado na última run) |
| E | Agendamento | Vencimento (select "Dia 1"), 1ª/2ª opção de data (selects), períodos, termos, botão **"Concluir pedido"** |
| F | Confirmação | "Olá, {nome}" + próximos passos + resumo; `leadId` capturado via asb |

Diferenças estruturais para o fluxo novo: fluxo antigo divide cadastro/dados/endereço em 3 telas (A/B/C) e tem e-mail na tela B; fluxo novo funde tudo na etapa "Dados" e move o e-mail para "Agendamento". Botão final antigo: "Concluir pedido"; novo: "Continuar compra". Layout antigo tem card "Resumo"/"Total" com botão dentro; novo tem carrinho lateral sem botão.

## Detecção de fluxo (novo vs. contingência)

Marcadores do fluxo novo (verificar após load, pós-hidratação):

- `document.querySelector('#Name')` existe **e** título H1 = `Olá, vamos iniciar sua compra online`
- Stepper com 3 labels: Dados / Agendamento / Confirmação
- URL de checkout: `internet.vivo.com.br/checkouts/fibra/`

Marcadores do fluxo antigo: heading `Informe seus dados pessoais` com apenas 4 campos (Nome/Celular/CEP/Número) e card "Total"; botão final `Concluir pedido`.

Se nenhum marcador bater → status "fluxo desconhecido" no alerta (não confundir com site fora do ar).

## Regras confirmadas do INPUT da run (n8n → Actor)

```json
{
  "scenario": {
    "nome": "Teste Teste", "celular": "(11) 9XXXX-XXXX (Faker)",
    "cpf": "CPF sintético mod-11", "dataNascimento": "variável",
    "email": "teste@teste.com.br", "cep": "05427-010 (pool)",
    "numeroResidencia": "variável", "complemento": "1", "andar": "1",
    "pontoReferencia": "1", "tipoImovel": "Edificio"
  },
  "entry": { "productsIds": "235", "promotion": "600" },
  "config": { "timeoutPorStepMs": 30000, "capturarScreenshots": true,
              "headless": true, "proxyMode": "none", "warmup": true }
}
```

Output do Actor (dataset): `leadId`, `orderNumber`, `topazScore`, `checkpoints[]` (id, nome, status, durationMs, screenshotUrl, detalhe), `debug` (proxyMode, userAgent, warmup), `error`/`failedAt`. **Manter este contrato no novo fluxo** para não quebrar o n8n.

**E-mail padrão: `teste@teste.com.br`** (confirmado pelo INPUT; o teste manual de hoje usou teste@gmail.com apenas pontualmente). Descarte dos pedidos sintéticos: Topaz reprova por fraude/crédito (checkpoint D é observacional via data layer).

## Dados de teste usados (regras do monitoramento)

- Nome: Teste Teste · CPF sintético mod-11 · Celular Faker `(11) 98175-0915`
- Nascimento: 01/01/1997 · CEP do pool: 05427-010 (Rua Fernão Dias, Pinheiros/SP)
- E-mail: teste@gmail.com (⚠️ prefill do Actor atual usa `teste@teste.com.br` — alinhar)
- Tipo imóvel: Edifício, nº 111, complemento/andar/referência = "1"
- Vencimento: dia 01 · Instalação: 1ª data disponível (manhã) + 2ª data (manhã)

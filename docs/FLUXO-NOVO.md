# Vivo Fibra — Mapeamento do fluxo **Tático** (checkout BAU)

**URL:** `https://internet.vivo.com.br/checkouts/fibra/?id=<id>&offer=<offer>`
**Mapeado em:** 21/07/2026 · **recapturado em 21/08/2026** (duas execuções reais, dados sintéticos)
**Stack:** Next.js App Router, 100% client-rendered após hidratação.

> **Nomes de negócio (usar no alerta):** **Tático** = fluxo BAU, este checkout. **Infinity** = fluxo de contingência, quando o BAU dá problema (`loja.vivo.com.br` + BFF `unicommerceTacticalB2CBff`). A URL de cadastro do Infinity **redireciona** para o Tático quando ele está ativo.
> Pegadinha: o BFF do Infinity se chama *unicommerceTactical* e a LP carrega `id_origem_vivo=TaticoLP` — ali "Tático" é a LP de mídia, não a plataforma de checkout.

## O que mudou entre 21/07 e 21/08 (causa do falso-positivo `FALHA(B)`)

| | Julho | Agosto |
|---|---|---|
| Etapas | 3 (Dados · Agendamento · Confirmação) | **4** (Dados · **Endereço** · Agendamento · Confirmação) |
| Campos de endereço | na tela **Dados** | na tela **Endereço** |
| Rota | uma só, sem mudar entre etapas | **uma rota por etapa** |

O checkpoint B esperava `#enderecoCobranca` ganhar valor na tela Dados. Em agosto esse campo não existe mais ali → poll de 30 s → `FALHA(B)` com o funil da Vivo **funcionando**.

## Como saber que a etapa avançou (as três tentativas)

Três candidatos, dois eliminados por evidência:

1. **Texto de tela — não serve.** O `<h1>` é idêntico nas quatro telas: `Olá, vamos iniciar sua compra online`. (Erro do mapeamento de julho.)
2. **Rota — não serve.** Os paths `/dados`, `/endereco`, `/agendamento`, `/confirmacao/<pedido>` que aparecem nas capturas de rede são **paths virtuais que o site manda ao GA** (`dp`/`dl` do `g/collect`). O `location.pathname` real fica em `/checkouts/fibra/` do começo ao fim — comprovado no run de 21/08 20:42, que falhou em B *já estando na tela de Endereço*, com a URL inalterada. (Erro da primeira versão do patch.)
3. **Presença de campo — serve.** Cada etapa tem um campo exclusivo e os conjuntos não se sobrepõem:

| Etapa | Campo exclusivo |
|---|---|
| Dados | `#dataNascimento` |
| Endereço | `#enderecoCobranca` |
| Agendamento | `#Mail` |
| Confirmação | nenhum campo; texto `Pedido realizado com sucesso` (única tela com h1 próprio) |

Subtítulos por etapa existem e são estáveis (`Informe os seus dados:`, `Agora, você precisa preencher o endereço para instalação da fibra`), mas ficam como reforço — copy muda mais que estrutura de formulário.

## Etapa 1 — Dados (`/dados`)

| Campo | Seletor | Observações |
|---|---|---|
| Nome completo | `#Name` | |
| Celular | `#Phone` | máscara `(11) 96487-2745` |
| CEP | `#Cep` | dispara `GET viacep.com.br/ws/<cep>/json/` |
| Número da residência | `#Numero` | **está nesta tela**; reaparece preenchido na etapa Endereço |
| CPF | `#cpf` | minúsculo; backend aceita CPF sintético mod-11 |
| Data de nascimento | `#dataNascimento` | máscara `DD/MM/AAAA` |

Botão: texto **"Continuar compra"**, `type="button"`, `title="Avançar para o próximo passo"`. Localizar **por texto** (em julho o title vinha errado — não confiar nele).

## Etapa 2 — Endereço (`/endereco`)

Aqui vive o autofill do CEP.

| Campo | Seletor | Observações |
|---|---|---|
| CEP | `#Cep` | ecoado |
| Endereço | `#enderecoCobranca` | **autofill** (ViaCEP `logradouro`) |
| Número | `#Numero` | já vem da etapa anterior |
| Bairro | `#Bairro` | autofill |
| Estado | `#UF` (select) | autofill |
| Cidade | `#Cidade` | autofill |
| Tipo do imóvel | radios `name="tipoImovel"`, valores `Casa` / `Edifício` | **Casa vem marcado**; ids `#Casa` / `#Edifício` (com acento) |
| Andar | `#Extra3` | condicional — só com Edifício |
| Complemento | `#Complemento` | |
| Referência | `#EntregaPontoReferencia` | |
| Quadra e lote | checkbox `name="isQuadraLote"` | **sem id** |

Botões: "Voltar" e "Continuar compra" (ambos `type="button"`).

## Etapa 3 — Agendamento (`/agendamento`)

| Campo | Seletor | Observações |
|---|---|---|
| Vencimento | radios `name="dataVencimentoConta"`, ids `#01 #06 #10 #17 #21 #26` | `01` pré-marcado |
| E-mail | `#Mail` | **o e-mail só existe nesta etapa** (no Infinity ficava na tela B) |
| Data instalação 1 | select `#dataAgendamentoEquipamento` | values ISO |
| Período 1 | radios `name="periodoAgendamentoEquipamento"` | "Manhã" pré-marcado |
| Data instalação 2 | select `#DataAgendamentoEquipamento2` | capitalização inconsistente é do site |
| Período 2 | radios `name="PeriodoAgendamentoEquipamento2"` | |
| Termos | checkbox `name="optInTerms"` | **sem id**, obrigatório |

⚠️ **Os dois grupos de período repetem os ids `#manha`/`#tarde`** — só o `name` distingue. Nunca localizar período por id.

Botão: "Continuar compra", **`type="submit"`** — este é o commit real do pedido.

## Etapa 4 — Confirmação (`/confirmacao/<pedido>`)

- `<h1>`: `Pedido realizado com sucesso! ✅` (única tela com h1 próprio)
- **Número do pedido vem no path** (ex.: `20260821-5757026`) e é o mesmo `transaction_id` do evento `purchase` no dataLayer
- Sem formulário

## Backend e dependências

| O quê | Endpoint | Resposta observada |
|---|---|---|
| Transacional (substitui o `/asb`) | `POST asbb2c.accenture.com/api/` | auth: `{"response":{"status":200,"result":{"token":"<jwt>"}}}` · lead: `{"response":{"status":200,"result":"102\|64044654\|DUPLICADO\| 0.027"}}` |
| Autofill de endereço | `GET viacep.com.br/ws/<cep>/json/` | 200 + `logradouro`/`bairro`/`localidade`/`uf` |
| Datas de instalação | `GET brasilapi.com.br/api/feriados/v1/<ano>` | 200 + feriados |

Observações que mudam o desenho do monitor:

1. **O checkout Tático não consulta cobertura FTTH.** Nenhuma chamada de viabilidade aparece em nenhuma das duas capturas — inclusive com CEP de cidade sem cobertura boa (28640-000, Carmo/RJ), o fluxo segue igual. A cobertura é avaliada **entre o pedido e a aprovação da venda**, fora do site. O monitor mede *funil*, não cobertura — e não deve prometer o contrário.
2. **Duas dependências de terceiro no caminho crítico** (ViaCEP e brasilapi). Se uma cai, a tela quebra sem culpa da Vivo — o alerta precisa dizer isso, senão vira escalada errada.
3. **CEP geral quebra o autofill.** CEP de cidade pequena responde 200 com `logradouro: ""` (foi o caso do 28640-000): Endereço e Bairro vêm vazios e o form trava em "Campo obrigatório". **Regra do pool: só CEP com logradouro no ViaCEP.**
4. **Marcador do lead:** o formato pipe-separado continua igual ao do Infinity. Já vimos os dois casos: `112|<leadId>|INVÁLIDO|ms` com CPF novo (run do Actor em 21/08 20:42) e `102|<leadId>|DUPLICADO|ms` nas capturas manuais, que repetiram CPF/e-mail. Ou seja, o `INVÁLIDO` que embasa o acordo de descarte com a mídia Vivo **continua valendo** para as runs do monitor, que geram CPF novo a cada execução.
5. O avanço da etapa Dados **já grava um lead** no backend (um `102|...` por avanço), então uma run completa produz mais de um lead.
6. Não há Topaz no Tático — o checkpoint D é observacional e retorna imediato.

## Armadilhas do Actor (todas confirmadas na página real)

1. **Hidratação:** interação antes dela é silenciosamente ignorada. Usar `waitForHydration` (existência de `__reactProps$`) e verificar `el.value` depois de digitar.
2. **Inputs React controlados:** atribuir `.value` não registra no estado — digitar de verdade (`pressSequentially`).
3. **Classes CSS hasheadas por build** (`input_inputData__T4bNK`) — nunca usar como seletor. IDs e `name` são estáveis.
4. **Radios/checkboxes customizados:** o `<input>` real é invisível; clicar no `<label>` ancestral (fallback: `el.click()` programático) e conferir o `checked`.
5. **Texto de tela não distingue etapa** — só rota.
6. **Instabilidade de captura:** já houve timeout de CDP (~30 s) com a página funcional; screenshot é best-effort e não deve derrubar o fluxo.

## Mapeamento checkpoint → etapa (contrato mantido com o n8n)

| CP | Nome (n8n) | Tático faz |
|---|---|---|
| Z | Landing Page | catálogo `total.json` + monta o deep link |
| A | Cadastro inicial | hidratação + nome, celular, CEP (aguarda ViaCEP), número |
| B | Dados pessoais | CPF, nascimento → "Continuar compra" → aparece `#enderecoCobranca` |
| C | Endereço de instalação | valida autofill + tipo de imóvel/complemento/referência → aparece `#Mail` |
| D | Crédito (Topaz) | observacional; inexistente no Tático |
| E | Agendamento | vencimento, e-mail, 2 datas, períodos, termos |
| F | Confirmação | submit final → texto de sucesso; pedido do `transaction_id` do dataLayer, leadId do asbb2c |

Contrato de output preservado: `checkpoints[]`, `failedAt`, `leadId`, `orderNumber`, `topazScore`, `error`, `debug`. Novidades em `debug`: `flow.nome` (**Tático**/**Infinity**, para o alerta nomear o funil), `deps` (status de ViaCEP e brasilapi) e `tatico` (respostas do backend, sem o JWT).

## Dados de teste (regras do monitoramento)

Nome `Teste Teste` · CPF sintético mod-11 · celular Faker · nascimento variável · e-mail `teste@teste.com.br` · CEP do pool **com logradouro** (`05427-010`, Rua Fernão Dias, Pinheiros/SP) · tipo de imóvel Edifício com complemento/andar/referência = `1` · vencimento dia 01 · 1ª e 2ª data disponíveis, período manhã.

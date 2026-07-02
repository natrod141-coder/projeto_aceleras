# Azure Cost Estimator
**Dataside · Programa Aceleras — Grupo 1 (Cauã + Natália)**

Ferramenta web para estimativa de custo de soluções Azure + Databricks, com valores fiéis às calculadoras oficiais da Microsoft — eliminando o retrabalho manual de preenchimento a cada novo projeto.

---

## O Problema

Todo projeto de dados da Dataside começa com a mesma pergunta: **quanto vai custar na nuvem?**

O processo hoje tem dois gargalos que se somam:

| Dor | Impacto |
|---|---|
| **Estimativa manual** — o arquiteto preenche a calculadora oficial serviço a serviço, de 40 min a 2h por projeto | Tempo perdido a cada novo projeto |
| **Retrabalho obrigatório** — a conta interna não basta; para pedir incentivo ao parceiro Microsoft, é preciso enviar a calculadora oficial preenchida | O mesmo trabalho feito duas vezes |
| **Risco de erro** — um parâmetro errado ou serviço esquecido distorce a proposta inteira | Perda de credibilidade ou margem |
| **Bloqueio comercial** — sem a calculadora oficial, o parceiro não aceita a solicitação de incentivo | Receita travada |

---

## A Solução

Uma ferramenta web interna onde o arquiteto descreve a arquitetura **uma vez** — provider, serviços, volumetria, ambientes — e recebe de volta:

1. **Estimativa de custo mensal** fiel aos valores da calculadora oficial da Azure
2. **Breakdown por serviço e por ambiente** (DEV / HOM / PROD)
3. **Guia de preenchimento** com os parâmetros exatos para colar na calculadora oficial, ambiente por ambiente

---

## Escopo do MVP

### Dentro do MVP

| Serviço | Justificativa |
|---|---|
| **Storage — ADLS Gen2** | Universal nos 3 casos reais (Simpress, PRIO, AMAGGI) |
| **Azure Databricks — All-Purpose Compute** | Universal; maior driver de custo |
| **Azure Databricks — Job Compute** | Presente em PRIO e AMAGGI |
| **Azure Databricks — SQL Serverless** | Presente em PRIO e AMAGGI |
| **Key Vault** | Custo desprezível (~$0,18/mês); modelado como valor fixo sem input do usuário |

### Fora do MVP (decisão de escopo)

| Serviço | Motivo do corte |
|---|---|
| **Azure Data Factory** | Aparece em apenas 1 dos 3 casos reais (PRIO); lógica de cobrança por atividade/unidade muito distinta |
| **PostgreSQL** | Aparece em apenas 1 dos 3 casos reais (AMAGGI) |
| **Microsoft Fabric** | Frequência baixa (10% da esteira do arquiteto Cauã); modelo de cobrança por capacidade incompatível com o modelo serviço-a-serviço do MVP |

> **Princípio aplicado:** *"Uma coisa que roda vale mais que tudo pela metade."* — Material do desafio Aceleras

---

## Premissas Travadas

Confirmadas por Oscar, Nelson e Cauã nas entrevistas de discovery:

| Premissa | Valor | Fonte |
|---|---|---|
| Modelo de preço | Always on-demand / pay-as-you-go | 3 arquitetos, unânime |
| Moeda | USD (exceto Brazil South → BRL) | 3 arquitetos, unânime |
| Licensing Program | MCA — default da calculadora Microsoft | Nelson: "pode ignorar" |
| Descontos (Savings Plans, Reservas) | **Nunca** aplicados na estimativa inicial | 3 arquitetos, unânime |
| Estrutura de ambientes | DEV + PROD obrigatórios; HOM opcional | Confirmado — não aparece em 2 dos 3 casos reais |
| Operações de Storage | Padrão Dataside: 8 MB × 11 ops (ajuste fino na calculadora oficial) | Padrão observado nos gabaritos |

---

## Como Rodar

### Pré-requisitos
- Node.js 18+

### Instalação

```bash
git clone <url-do-repositorio>
cd azure-estimator
npm install
```

### Desenvolvimento

```bash
npm run dev
```

Abre em `http://localhost:5173`

### Validação do motor de cálculo

```bash
node validate.mjs
```

Roda os casos PRIO e AMAGGI contra os gabaritos oficiais e reporta a divergência percentual.
Saída esperada:

```
=== Validação do motor de estimativa (Azure Cost Estimator) ===

Caso: PRIO
  Calculado:  $2491.68
  Gabarito:   $2544.72 (MVP, excluindo itens fora do escopo)
  Diferença:  $-53.04  (-2.1%)
  Status:     ✅ PASSOU  (tolerância: ±5%)
  Nota:       ADF ($109) fora do MVP. Região mista (AP East US / Job West US) agora é reproduzida corretamente.
  Oficial completo: $2653.80

Caso: AMAGGI
  Calculado:  $4546.04
  Gabarito:   $4364.67 (MVP, excluindo itens fora do escopo)
  Diferença:  $181.37  (4.2%)
  Status:     ✅ PASSOU  (tolerância: ±5%)
  Nota:       Linha 6 do PDF (D16AV4 All-Purpose 730h, $1858.58) excede as 4 linhas que o MVP cobre.
  Oficial completo: $6223.25

================================================================
✅ Todos os casos dentro da tolerância definida.
```

---

## Como Garantimos Fidelidade aos Valores Oficiais

### Metodologia

Os preços unitários em `src/data/prices.js` **não foram inseridos manualmente** a partir de documentação estática — foram derivados via **engenharia reversa sobre gabaritos oficiais reais** exportados da calculadora da Microsoft pelos próprios arquitetos da Dataside.

**Sistema de equações (Databricks Compute):**

Com os 5 workloads do caso AMAGGI, montamos um sistema linear determinado com 5 equações e 5 incógnitas (preço de VM por instância em West US + DBU por tier de workload). O sistema fecha exatamente e os preços encontrados são cross-validados contra o caso PRIO: o D8AV4 em West US calculado pelo AMAGGI ($0,448/h) é idêntico ao calculado via Job Compute do PRIO (também West US, $0,448/h) — fontes independentes, mesmo número.

**Validação cruzada:**

| Caso | Total Calculado | Total Oficial | Divergência |
|---|---|---|---|
| PRIO | $2.533,28 | $2.653,80 | −4,5% (Sem ADF)|
| AMAGGI | $4.546,04 | $6.223,25 | -27% (Sem linha SQL extra) |

Os dois casos estão em **lados opostos** da linha (um abaixo, um acima), indicando que o modelo não está sistematicamente enviesado — a variação residual é distribuída, não acumulada.

### Teste de Regressão Automatizado

`validate.mjs` funciona como teste de regressão: se alguém alterar `prices.js` (ou quando a Microsoft atualizar os preços de tabela), basta rodar `node validate.mjs` para saber imediatamente se o motor ainda está dentro da tolerância. O script retorna `exit code 1` se qualquer caso falhar, o que permite integração futura com CI/CD.

---

## Arquitetura da Ferramenta

```
src/
├── data/
│   └── prices.js          # Única fonte de verdade dos preços unitários
│                          # Atualizar aqui quando a Microsoft mudar tabela
├── engine/
│   └── calculator.js      # Motor de cálculo puro (sem side effects)
│                          # Recebe input → retorna { lines, total, currency }
└── App.jsx                # Interface React (lê engine, nunca toca em prices diretamente)

validate.mjs               # Script de regressão — roda fora do browser, via Node
```

**Princípio de design:** `prices.js` é o único ponto de verdade. O motor de cálculo (`calculator.js`) não conhece a interface, e a interface (`App.jsx`) não conhece os preços — só o motor. Isso garante que qualquer atualização de preço se propaga por toda a aplicação mudando uma linha.

---

## Limitações Conhecidas e Documentadas

### 1. Storage: taxa única por volume
A taxa de Storage (`$0,02157972/GB` em East US) foi calibrada no caso AMAGGI (72 TB), que pode já estar na segunda faixa de desconto por volume da Azure. Para volumes menores, a taxa real pode ser ligeiramente maior. O impacto observado no PRIO (11 TB) está dentro da tolerância de ±5%, mas volumes muito pequenos (<100 GB) podem divergir mais.

**O que seria feito com mais tempo:** Usar a [Azure Retail Prices API](https://prices.azure.com/api/retail/prices) para puxar os tiers de volume reais do meter `Hot LRS Capacity` e modelar a progressividade exata.

### 2. SQL Serverless: fórmula aproximada via workaround
O SQL Serverless da Azure tem cobrança por tamanho de cluster fixo (XSmall = 6 DBU/h, sem componente de VM), diferente dos outros workloads. No MVP, o campo é preenchido via combinação de nós/instância que produz o mesmo número de DBU — funcionalmente correto no resultado, mas conceitualmente impreciso no input. O usuário informa "4 nós × D8AV4 (1,5 DBU)" em vez de "XSmall (6 DBU direto)".

**O que seria feito com mais tempo:** Criar seletor dedicado (XSmall / Small / Medium) com preço por DBU específico do SQL Serverless (~$0,70/DBU-h).

### 3. Key Vault: custo aplicado em todos os ambientes
O toggle de Key Vault aplica o custo fixo ($0,18) nos 3 ambientes (DEV + HOM + PROD), independente de HOM estar ativo. Em projetos sem HOM, o total fica $0,18 acima do real.

### 4. Regiões com cobertura parcial
Alguns preços de VM só estão calibrados para as regiões dos casos reais disponíveis. Regiões fora de East US / West US / Brazil South podem retornar `$0` silenciosamente.

### Validação circular
Os 2 casos disponíveis foram usados tanto na calibração quanto na validação — o validate.mjs prova consistência matemática, não independência estatística. Validação cega com terceiro caso é o item #1 do roadmap.

---

## O que Faríamos Diferente

1. **Azure Retail Prices API em vez de tabela estática** — elimina a necessidade de recalibração manual quando a Microsoft atualiza preços. A API é pública, sem autenticação, e retorna JSON estruturado por meter/região.

2. **SQL Serverless com seletor de tamanho nativo** — a interface deveria refletir exatamente como a calculadora da Azure funciona: selecionar "XSmall / Small / Medium", não instância de VM.

3. **Geração do link de preenchimento da calculadora oficial** — a exploração do DevTools confirmou que o link compartilhável da Azure é gerado via POST (ID no servidor, não estado na URL). Com mais tempo, investigaríamos automação de preenchimento via Playwright/Puppeteer, dado que agora conhecemos exatamente quais campos precisam ser preenchidos e em que ordem.

4. **Tiered pricing para Storage** — modelar as faixas de desconto por volume da Azure em vez de taxa única.

5. **Integração com o sistema interno de propostas da Dataside** — visão de longo prazo mencionada pelo Oscar: a ferramenta lê o escopo em texto da proposta e pré-preenche a estimativa automaticamente.

---

## Casos Reais Usados como Gabarito

| Cliente | Provider | Total Oficial | Serviços |
|---|---|---|---|
| **AMAGGI** | Azure (East US) + Databricks (West US) | $6.223,25/mês | Storage 72TB, All-Purpose, Job, SQL, PostgreSQL |
| **PRIO** | Azure (East US) + Databricks (East/West US) | $2.653,80/mês | Storage 11TB, All-Purpose, Job, SQL, Key Vault, ADF |
| **Simpress** | Azure (Brazil South) + Databricks Standard | R$2.013,26/mês | Storage 10GB, Job Compute Standard, Key Vault |

---

## Decisões de Processo

- **Provider escolhido (Azure + Databricks):** Recomendação convergente de Nelson e Cauã — 80% dos projetos do Cauã são Azure, 90% desses com Databricks (~72% da esteira). Azure também centraliza o Databricks na mesma calculadora (vs. AWS que exige 2 calculadoras separadas).
- **Spike técnico (Dia 3):** Testamos se o link compartilhável da Azure poderia ser gerado programaticamente (geraria a calculadora pré-preenchida automaticamente). Resultado: descartado — o botão "Salvar" dispara POST para o servidor da Microsoft, retornando ID único aleatório. O link não é auto-contido na URL.
- **Export XLSX:** Testado e descartado como input automatizável — o campo `Description` é texto livre, não colunas estruturadas por parâmetro. Papel atual: gabarito de validação manual.
- **Moeda Brazil South em BRL:** Identificado durante exploração do export XLSX (Simpress). Confirmado com arquiteto — estimativas internacionais sempre em USD, Brazil South em BRL.

---

*Programa Aceleras — Dataside · Junho 2026*

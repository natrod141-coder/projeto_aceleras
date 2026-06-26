# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
# Azure Cost Estimator — Aceleras (Grupo 1)

## O Problema
Hoje, a estimativa de custo cloud é feita manualmente pelo arquiteto
e depois refeita do zero na calculadora oficial do provider (exigida
para solicitar incentivo ao parceiro). Esse retrabalho gera perda de
tempo, risco de erro e bloqueio comercial. Esta ferramenta calcula a
estimativa internamente, com fidelidade aos valores oficiais da Azure,
e gera [a ponte/guia de preenchimento] para a calculadora oficial.

## Escopo (Decisões de Recorte)

**Provider escolhido:** Azure + Databricks (tratado como um único
motor de cálculo, já que o Databricks é cobrado em conjunto com a
infra Azure subjacente).

**Por que Azure + Databricks, e não AWS:**
- Maior frequência real de uso confirmada por dois arquitetos
  (Nelson; Cauã: 80% dos projetos em Azure, 90% destes com Databricks)
- Tecnicamente mais simples: AWS+Databricks exige duas calculadoras
  separadas; Azure+Databricks fica numa só.

**Serviços modelados no MVP:**
| Serviço | Status | Justificativa |
|---|---|---|
| Storage (ADLS Gen2) | ✅ Incluído | Universal nos 3 casos reais analisados |
| Databricks — All-Purpose | ✅ Incluído | Universal; maior driver de custo |
| Databricks — Job Compute | ✅ Incluído | Presente em 2 de 3 casos |
| Databricks — SQL Serverless | ✅ Incluído | Presente em 2 de 3 casos |
| Key Vault | ✅ Incluído (custo fixo) | Universal onde aparece, mas custo desprezível (~$0,15-0,18/mês) |
| Azure Data Factory | ❌ Fora do MVP | Presente em apenas 1 de 3 casos reais (PRIO) |
| PostgreSQL | ❌ Fora do MVP | Presente em apenas 1 de 3 casos reais (AMAGGI) |
| Microsoft Fabric | ❌ Fora do MVP | Baixa frequência relativa; modelo de cobrança diferente |

**Premissas fixas (não expostas como input):**
- Moeda: USD
- Modelo de preço: sempre on-demand/pay-as-you-go (confirmado por 3
  arquitetos — nunca reserva ou Savings Plan)
- Licensing Program: MCA (default de qualquer calculadora Microsoft)
- Ambientes: configurável (1 a 3). Dev e Prod como padrão; Hom é
  opcional, não apareceu nos 2 casos reais usados como gabarito.

## Metodologia de Validação

Seguimos o método de validação progressiva: hipótese → teste contra
casos reais → produtização. Coletamos 3 estimativas reais já fechadas
(PRIO, AMAGGI, Simprise/Simpress) diretamente das calculadoras oficiais
dos arquitetos, extraindo os parâmetros de input (capacidade, tipo de
instância, horas) e o custo oficial resultante de cada linha de serviço.
Os preços unitários usados no motor (`prices.js`) foram extraídos
diretamente desses casos reais, não de documentação genérica — para
garantir que a base de cálculo parte do mesmo número que o parceiro vê.

## Resultados de Validação

**PRIO:**
| Ambiente | App | Gabarito oficial | Diferença |
|---|---|---|---|
| DEV | $126,73 | [CONFIRMAR] | [CONFIRMAR] |
| PROD | $1.928,68 | [CONFIRMAR] | [CONFIRMAR] |
| **Total** | **$2.634,02** | **$2.653,80** | **$19,78 (0,8%)** |

[CONFIRMAR] Causa raiz exata da diferença de $19,78 — breakdown linha
a linha pendente de confirmação (ver nota abaixo).

**AMAGGI:** [pendente — segunda validação]

## O Que Faríamos Diferente
- [a preencher conforme o time for percebendo limitações]
- Possível candidato: preço de storage fixo por GB no MVP, quando a
  Azure usa tiers progressivos de volume — simplificação consciente,
  a detalhar se confirmada. 

## Limitações Conhecidas
- Não cobre Data Factory, PostgreSQL ou Fabric (fora do escopo, por
  baixa frequência relativa nos 3 casos reais analisados).
- [CONFIRMAR] Esclarecer se o ADF foi ou não incluído no cálculo de
  PROD do PRIO — necessário para a seção de Resultados acima.
- Ambiente de Homologação tratado como opcional, não obrigatório, 
  decisão baseada em ausência de Hom nos 2 casos reais, mesmo as
  entrevistas apontando Hom como padrão recomendado.

## Como Rodar
[ a preencher ]

## Stack
- Vite + JavaScript
- Preços hardcoded em `prices.js`, extraídos de casos reais (PRIO,
  AMAGGI, Simprise)
# Azure Cost Estimator — Aceleras (Grupo 1)

## O Problema
Todo projeto começa com a mesma pergunta: quanto vai custar na nuvem? Atualmente, a estimativa de custo cloud é feita manualmente pelo arquiteto e depois refeita do zero na calculadora oficial do provider, pois a oficial é obrigatória para solicitar incentivos comerciais. Esse retrabalho gera perda de tempo, risco de distorção na proposta e bloqueios de aprovação. 

Esta ferramenta ataca essas dores atuando como um motor de cálculo de alta precisão. Ela processa as especificações da arquitetura com fidelidade aos valores oficiais da Azure e gera um **Guia de Preenchimento estruturado** na tela, levando o arquiteto a preencher a calculadora oficial de forma rápida e à prova de erros.

## Escopo (Decisões de Recorte)

Em alinhamento com a diretriz de "recortar com critério: uma coisa que roda vale mais que tudo pela metade", focamos em resolver a complexidade matemática do provider mais utilizado.

**Provider escolhido:** Azure + Databricks.
- **Justificativa:** Maior frequência real de uso confirmada por arquitetos (80% dos projetos em Azure, 90% destes com Databricks). Além disso, o Databricks atua de forma nativa e conjunta com a infraestrutura Azure subjacente, o que torna a modelagem do motor um desafio técnico de alto valor para a operação.

**Serviços modelados no MVP:**
| Serviço | Status | Justificativa |
|---|---|---|
| Storage (ADLS Gen2) | ✅ Incluído | Universal nos casos reais analisados. |
| Databricks — All-Purpose | ✅ Incluído | Universal; maior driver de custo. |
| Databricks — Job Compute | ✅ Incluído | Presente na maioria dos casos reais. |
| Databricks — SQL Serverless | ✅ Incluído | Estruturado para aceitar ou zerar custos de VM separadamente. |
| PostgreSQL (Flexible) | ✅ Incluído | Suportado via flag opcional no motor. |
| Key Vault | ✅ Incluído | Suportado via flag opcional no motor. |
| Azure Data Factory | ❌ Fora do MVP | Frequência relativa menor; recortado para priorizar o motor Databricks. |

**Premissas fixas:**
- Moeda: USD
- Modelo de preço: Pay-as-you-go (on-demand), confirmado como o padrão nas propostas iniciais.
- Ambientes: Granularidade completa (Dev, Homologação e Prod), com a inteligência de zerar ambientes inativos caso a arquitetura do cliente (como o caso AMAGGI) contemple apenas Produção.

## Metodologia de Validação

Seguimos o método de validação progressiva (Hipótese → Teste → Produtização). O núcleo do projeto é o nosso motor de cálculo modular (`calculator.js`), que separa rigorosamente as horas de processamento (DBU) do custo de infraestrutura (VM).

Para atestar a regra de negócio, construímos um script de regressão automatizado (`validate.mjs`). Extraímos os parâmetros exatos de arquiteturas reais fechadas (PRIO e AMAGGI) e submetemos ao nosso motor. O sistema de testes foi configurado com uma trava de tolerância rigorosa de ±5% em relação ao gabarito oficial gerado pelos arquitetos.

## Resultados de Validação

Os testes automatizados provam a fidelidade do motor contra as estimativas oficiais do mundo real:

| Caso de Uso | Calculado pelo Motor | Gabarito Oficial | Diferença | Status (Tol. 5%) |
|---|---|---|---|---|
| **PRIO** | $2.628,62 | $2.653,80 | -0.9% | ✅ PASSOU |
| **AMAGGI** | $6.284,14 | $6.223,25 | +1.0% | ✅ PASSOU |

*Nota: O caso AMAGGI atestou a capacidade do motor de reconhecer instâncias Databricks SQL Serverless, onde a infraestrutura de VM nativa do provider não é cobrada do cliente.*

## O Que Faríamos Diferente (Próximos Passos)

- **Integração com a Azure Retail Prices API:** No escopo atual, os preços base da Azure foram mantidos estáticos (hardcoded no arquivo `prices.js`). Esta foi uma decisão consciente para blindar o MVP contra instabilidades de rede e garantir uma ferramenta 100% funcional no prazo de entrega. Como evolução natural (Roadmap v2.0), o sistema consumirá a API pública da Microsoft em tempo real, eliminando qualquer defasagem de preços no futuro sem a necessidade de intervenção no código.
- **Tiers Progressivos de Storage:** O cálculo de ADLS Gen2 utiliza um valor fixo por GB no MVP. Em uma próxima versão, implementaríamos a lógica de desconto progressivo por volume de dados hospedado.

## Como Rodar o Projeto

**1. Para rodar a Interface Gráfica (Front-end):**
Instale as dependências e inicie o servidor de desenvolvimento.
```bash
npm install
npm run dev
``` 

**2. Para rodar o script de regressão:**
Para rodar a auditoria e verificar a precisão do motor:
Certifique-se de estar na pasta raiz do projeto.
Execute o script no terminal:
```bash
   node validate.mjs 
```

## Stack Tecnológica
- **Front-end:** Vite + React/JavaScript (Interface visual e geração dinâmica do Guia de Preenchimento).
- **Back-end / Motor:** Node.js (Lógica matemática isolada no `calculator.js` e testes de regressão automatizados no `validate.mjs`).
- **Dados:** Estrutura modular fixa no `prices.js`, atuando como base de dados estática provisória para o MVP, com preços reais extraídos de propostas fechadas.
# Log de Organização e Decisões de Arquitetura

## Método de Trabalho e Entrevistas
Durante as duas semanas de projeto, operamos com um modelo de descoberta e validação progressiva. A primeira semana foi focada em entrevistas com os arquitetos da empresa (Nelson, Cauã e Oscar) para mapear a dor real, enquanto a segunda semana foi dedicada ao desenvolvimento em frentes paralelas (Front-end e Back-end).

## Linha do Tempo: Semana 1 (Descoberta e Escopo)

### Dia 2: Definição de Provider e Recorte
- **Provider Escolhido:** Azure + Databricks.
- **Justificativa (Dados das entrevistas):**
  - **Frequência:** Nelson recomendou explicitamente este caminho. Cauã (arquiteto) relatou que 80% dos projetos dele são Azure, e 90% desses usam Databricks (~72% da esteira).
  - **Viés Isolado:** Oscar reportou AWS como 60-70%, mas como é o único dedicado a AWS, identificamos um viés de amostragem.
  - **Complexidade Técnica:** Oscar apontou que AWS+Databricks exige duas calculadoras separadas (e a da Databricks não possui link compartilhável, exigindo *print screen*). Azure permite embutir o Databricks em uma única calculadora oficial.

### Premissas de Modelagem Obrigatórias
- **Ambientes:** A estimativa deve ser dividida em até 3 ambientes (Dev, Hom, Prod), onde Homologação usa o mesmo hardware de Prod, mas com runtime reduzido.
- **Precificação:** Uso estrito de tabela on-demand/lista pública em USD, sem aplicação de descontos, simplificando o MVP.
- **Região:** Tratada como parâmetro de primeira classe (Cauã exemplificou um projeto saltando de US$ 8k para US$ 13k apenas pela mudança de região para o Brasil).
- **Risco de "Data Computing":** Oscar e Cauã convergiram que estimar o tempo de execução de pipelines é o ponto de maior incerteza. **Decisão:** No MVP, o usuário insere as horas de cluster estimadas diretamente, evitando lógicas complexas e frágeis de "tentar adivinhar" horas por pipeline.

### Dia 3: O Spike Técnico da "Ponte"
- Investigamos como automatizar a ida para a calculadora oficial.
- Nelson e Cauã citaram que a Azure gera links de compartilhamento. Fizemos um *spike* técnico curto (meio dia) para tentar gerar a URL codificada diretamente pelo nosso sistema.
- **Resultado/Decisão:** Para garantir o MVP no prazo sem depender de engenharia reversa complexa de URLs da Microsoft, optamos pelo "Fallback Garantido": a geração de um **Guia de Preenchimento Manual** dinâmico na tela.

---

## Linha do Tempo: Semana 2 (Desenvolvimento e Integração)

Para acelerar a entrega e transformar as decisões da Semana 1 em código, dividimos as responsabilidades técnicas:

**Natália (Back-end e Validação Matemática):**
- Estruturação da lógica do motor de cálculo (`calculator.js`).
- Mapeamento das regras do Databricks (separação de custos de DBU vs. infraestrutura de VM).
- Construção do script de testes automatizados (`validate.mjs`) operando 2 dos 3 casos reais coletados.
- Calibragem do motor para atingir precisão máxima, porém com as restrições do MVP (Gabarito Reduzido), nós chegamos nos números -2,1% (PRIO) e +4,2% (AMAGGI).
- Refinamento lógico e estrutural do Parser de Preenchimento Automático. Aplicação de Expressões Regulares (Regex) avançadas — como Negative Lookahead para evitar falsos positivos entre memória RAM e Storage — e reestruturação do algoritmo de fatiamento de texto (Block Slicing) para garantir a extração isolada e precisa de dados de arquiteturas complexas.

**Cauã Souza Almeida (Front-end e Interface):**
- Construção da interface visual interativa (MVP).
- Mapeamento da experiência do arquiteto, acomodando os inputs de horas (mitigando o risco de *Data Computing* identificado no Dia 2).
- Construção do painel "Guia de Preenchimento", consolidando a decisão de UX tomada após o *spike* do Dia 3.
- Implementação da Killer Feature do MVP: O Preenchimento Automático (BETA). Criação de um parser de texto capaz de ler PDFs ou propostas brutas e traduzir em configurações de estado no React, antecipando uma visão de longo prazo do negócio já para a entrega do MVP.

### Integração (O "Handshake")
O ponto crítico foi alinhar o contrato de dados entre a interface e o motor. Quando o Front-end evoluiu para acomodar cenários complexos (como o Databricks SQL Serverless que não cobra VM nativa), realizamos uma força-tarefa para atualizar o `validate.mjs`. Isso garantiu que o sistema não sofresse regressão de cálculo durante a junção das duas partes, cravando os gabaritos oficiais.

### Fase Final: QA e Refinamento do Parser

A introdução do Preenchimento Automático exigiu uma rodada intensiva de testes de stress (QA) utilizando os casos reais da PRIO e AMAGGI para garantir que o robô de leitura não gerasse falsos positivos. Durante esta fase, resolvemos três grandes desafios de engenharia:

- O Isolamento de Regiões (Block Slicing): O parser inicial apresentava vazamento de escopo (ex: o Job Compute "roubava" a região do SQL Serverless). Implementamos uma lógica de fatiamento de texto (split com regex) baseada em quebras de bloco e numeração de listas, garantindo que cada serviço fosse lido em seu próprio casulo textual.

- Falsos Positivos de Hardware vs. Storage: O script estava confundindo a memória RAM da máquina virtual (ex: "32 GB RAM") com o disco de Storage. Resolvemos isso aplicando Negative Lookahead nas Expressões Regulares ((?!\s*ram)), ensinando o robô a ignorar o termo GB se fosse seguido de RAM.

- Gestão de Estado React (Sticky State): Identificamos que alternar entre um projeto com PostgreSQL (AMAGGI) e um sem (PRIO) deixava o banco de dados "preso" na tela. Corrigimos o fluxo de atualização de estados no App.jsx, forçando o reset limpo de todos os componentes booleanos a cada novo clique no botão de automação.

- Resolução de Persistência de Estado (Sticky State) no Frontend: Durante os testes de stress, identificamos que a interface retinha valores de serviços de escopos anteriores (ex: SQL Serverless ou PostgreSQL vazando de um cliente para outro). Para solucionar isso, reescrevemos a função de mesclagem de estado (mergeParsedConfig) no React, implementando uma rotina de reset estrito. Agora, o sistema força o desligamento (booleano false) de qualquer serviço que não seja explicitamente encontrado pelo parser no novo texto, garantindo a blindagem matemática total ao alternar entre projetos
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
- Calibragem do motor para atingir precisão máxima, resultando em desvios quase nulos (-0.9% na PRIO e +1.0% na AMAGGI).

**Cauã Souza Almeida (Front-end e Interface):**
- Construção da interface visual interativa (MVP v0.1 e v0.2).
- Mapeamento da experiência do arquiteto, acomodando os inputs de horas (mitigando o risco de *Data Computing* identificado no Dia 2).
- Construção do painel "Guia de Preenchimento", consolidando a decisão de UX tomada após o *spike* do Dia 3.

### Integração (O "Handshake")
O ponto crítico foi alinhar o contrato de dados entre a interface e o motor. Quando o Front-end evoluiu para acomodar cenários complexos (como o Databricks SQL Serverless que não cobra VM nativa), realizamos uma força-tarefa para atualizar o `validate.mjs`. Isso garantiu que o sistema não sofresse regressão de cálculo durante a junção das duas partes, cravando os gabaritos oficiais.
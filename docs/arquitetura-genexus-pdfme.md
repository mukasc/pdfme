# Documentação de Arquitetura: Integração GeneXus 18 + pdfme

Este documento serve como um guia de referência sobre as estratégias discutidas para modernizar a geração de relatórios e impressões em sistemas GeneXus utilizando a biblioteca `pdfme`.

---

## 1. O Conceito Central: Separação de Responsabilidades

O **pdfme** atua sob a premissa de que o Design do documento e os Dados devem ser entidades separadas. 
Em vez de desenhar via código (como os antigos *Print Blocks*), nós dividimos a lógica em duas partes:

1. **O Template (O Molde):** Desenhado de forma 100% visual usando o módulo `@pdfme/ui` (Designer). Ele gera um arquivo JSON contendo as posições de textos, tabelas, códigos de barra, e seus respectivos "nomes de variáveis" (ex: `invoicyCod`, `faturaVlr`).
2. **Os Dados (Inputs):** É a carga útil (JSON/SDT) que o backend levanta com as regras de negócio e preenche nas marcações do Template.

---

## 2. Abordagens de Integração com GeneXus 18

Como o GeneXus gera código em Java ou .NET e o `pdfme` é baseado em ecossistema JavaScript/Node.js, as integrações possíveis são:

### Opção A: Geração no Cliente (Frontend via User Control 2.0)
- **Como Funciona:** Você empacota a biblioteca num User Control do GeneXus e injeta os dados (SDT/JSON) diretamente na tela do usuário.
- **Uso Ideal:** Quando o PDF é gerado apenas para ser visualizado ou baixado pontualmente na tela da aplicação web, sem exigir processamento no servidor.

### Opção B: Geração no Backend via Microserviço Node.js (Mais Recomendado)
- **Como Funciona:** Cria-se um microserviço Node.js super leve rodando o `@pdfme/generator`. O GeneXus monta o JSON com as informações, faz um `POST` (via `HttpClient` nativo do GX) para esse microserviço, e recebe o binário do PDF como resposta.
- **Uso Ideal:** Impressão pesada, em lotes, geração de faturas de madrugada, processos que enviam PDFs por email em *background*.

### Opção C: Utilizar o serviço SaaS (pdfme Cloud)
- **Como Funciona:** O GeneXus apenas consome a API oficial do pdfme na nuvem, sem que a empresa precise se preocupar com infraestrutura de servidores.

---

## 3. Benefícios de Performance e Custos na Nuvem

Migrar a lógica de *Procedures com Printblocks* ou de bibliotecas tradicionais pesadas (iText, JasperReports, Headless Browsers como Puppeteer) para a "Opção B" traz ganhos significativos:

- **Extrema Leveza:** O `pdfme` usa o `pdf-lib` manipulando os buffers diretamente. Isso consome pouquíssima memória RAM.
- **Velocidade:** Diferente de ferramentas que abrem "Chrome Invisível" (wkhtmltopdf/Puppeteer) que demoram segundos por arquivo, a renderização aqui leva milissegundos.
- **Serverless (Custo de Cloud):** Por ser extremamente rápido e leve, ele é ideal para rodar em *Cloud Functions* (AWS Lambda, Google Cloud Run). Você paga apenas pelos milissegundos utilizados durante a geração, sem a necessidade de instâncias de máquinas pesadas rodando 24 horas.

---

## 4. O Fim do Código "Espaguete" e da Dependência de Deploy

### O Problema Atual
Hoje as impressões do sistema misturam extração de dados do banco de dados, regras de negócio complexas e regras de layout (espaçamentos, quebra de linha) num único arquivo (Procedure). Qualquer alteração estética (adicionar uma logomarca, mudar uma fonte) exige que um desenvolvedor mexa no código, recompile o backend e faça um novo deploy na produção.

### A Nova Arquitetura
1. **GeneXus:** A Procedure passa a servir apenas para ler o banco de dados e aplicar as regras de negócio. Ela não entende mais de "Layout". Ela apenas converte as respostas das regras para um SDT (JSON).
2. **Design Visual:** O componente Designer do `pdfme` (`@pdfme/ui`) pode ser embutido em uma tela administrativa do próprio sistema. Usuários ou administradores podem arrastar elementos no layout e o sistema simplesmente salva o novo JSON gerado no banco de dados.
3. **Resultado:** Se a Receita Federal ou um cliente exigir um campo extra, a equipe pode adicionar isso no Designer (interface visual) em produção e já passa a valer, **sem precisar recompilar ou fazer deploy de código Backend**.

---

## 5. Estratégia de Migração para Produção (Zero Downtime)

Como substituir o motor antigo no qual todos os clientes em produção confiam sem correr riscos ou causar paradas (downtime)? A melhor estratégia é o **Strangler Fig Pattern** aliado a **Feature Flags**.

**O Passo a Passo da Migração:**
1. **Deploy Independente:** O microserviço Node.js com o `pdfme` é subido de forma isolada (ninguém o chama, então zero impacto).
2. **Procedura Paralela no GeneXus:** Mantém-se intacta a procedure de `Print Blocks` antiga. Cria-se uma nova Procedure lado a lado apenas para preparar o SDT JSON e consumir o Node.js.
3. **A Chave (Feature Flag):** Cria-se um parâmetro no banco (ex: `UsaNovaImpressao = False`). Todos os clientes continuam `False` em produção, logo, continuam passando pela rotina antiga mesmo após o update do sistema.
4. **Rollout Gradual:** Escolhe-se um cliente beta, altera-se o parâmetro dele para `True`. Apenas esse cliente testará o novo PDF via Node.js em produção. Se houver falha, vira-se a chave para `False` e ele retorna para o motor antigo instantaneamente (sem deploy).
5. **Fase Final:** Com o sistema validado, todos os clientes vão migrando. Uma vez que 100% migrou, as rotinas de impressão nativas e antigas do GeneXus podem ser deletadas para sempre.

---

## 6. Gestão de Versões e Retrocompatibilidade (Documentos Antigos vs Layout Novo)

Um desafio clássico ocorre quando os dados estruturados (ex: arquivos XML gerados pelo sistema) possuem diferentes versões ao longo do tempo (ex: `1.0.0` vs `2.1.0`), o que significa que XMLs antigos podem não ter os mesmos campos que os novos. Se o layout for atualizado para a versão mais recente e tentar imprimir um XML antigo, pode haver desencontro de dados.

Felizmente, existem abordagens seguras para tratar esse cenário:

### Tolerância a Falhas Nativa do pdfme
Primeiro, é importante destacar que **o `pdfme` não trava (crash) por inconsistência de dados**:
- Se o XML enviar **campos a mais** (que não existem no layout), o gerador simplesmente ignora esses campos extras.
- Se o XML tiver **campos a menos** (o layout pede uma variável, mas o XML antigo não a possui), o gerador não gera erro; a área no PDF simplesmente ficará **em branco**.

### Estratégia 1: Versionamento de Templates no Banco de Dados
Para garantir fidelidade absoluta ao formato original da época, em vez de ter um único layout ("O Layout da Fatura"), você salva os templates relacionando-os à versão do documento.
- No banco de dados, você armazena: `[TipoDoc = Fatura, VersaoXML = 1.0.0, JSON_Template = {...}]`.
- Quando o GeneXus for imprimir um XML antigo (versão `1.0.0`), ele busca e envia o template `1.0.0`. Quando for imprimir um novo, busca o template `2.1.0`. Cada arquivo é impresso com a "roupa" da sua época, o que é ótimo para compliance (auditoria).

### Estratégia 2: Adapter/Mapper Universal no Backend (Recomendado)
Se a regra de negócios disser que "toda impressão deve usar o layout mais moderno da empresa, não importa a idade do documento", você precisará de uma camada adaptadora no GeneXus.
- Você usa **sempre o último Template** (ex: o da versão 2.1.0).
- No GeneXus, cria-se um **Data Provider** que atua como tradutor. Ele recebe qualquer versão do XML e "normaliza" a saída para o SDT da versão 2.1.0.
- Se o XML antigo não tinha a tag `<ChavePix>`, o GeneXus injeta `ChavePix = "Não informada"` ou `""` no JSON que vai para o `pdfme`. 
- Dessa forma, você mantém a interface visual (Template) sempre atualizada e única, deixando que o backend trate de uniformizar os dados do passado.

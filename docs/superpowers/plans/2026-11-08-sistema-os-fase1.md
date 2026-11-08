# Sistema de O.S. Garage 1240 — Fase 1 (v2.0.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir o portal de O.S. como aplicativo interno (dono + sócio) com login real, banco trancado, dados antigos migrados, ficha de serviço única, terceirização, financeiro manual, log de alterações e relatório PDF.

**Architecture:** Site estático sem etapa de build, em módulos ES. Lógica de negócio em módulos puros (sem DOM, sem Firebase) testados com o test runner do Node; acesso ao Firestore concentrado em `src/data/`; telas em `src/views/`. Toda escrita passa por `repo.js`, que grava o documento e a entrada de log na mesma transação.

**Tech Stack:** JavaScript (ES modules), Firebase 10.13 (Auth e-mail/senha, Firestore) via CDN, jsPDF + autotable via CDN, `node --test`, Firebase Emulator (Java 21 e firebase-tools 15 já instalados), GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-08-sistema-os-garage1240-design.md`

## Global Constraints

- Interface e mensagens em **português do Brasil**.
- Hospedagem: **GitHub Pages**; dados: **Firebase/Firestore**. Sem custo, sem servidor próprio, sem build.
- Versão inicial **v2.0.0**; formato `v2.X.Y`; tag git `v2.0.0`; entrada em `CHANGELOG.md`; número visível no rodapé do app (`src/version.js` → `APP_VERSION`).
- Dois usuários, ambos com permissão total. Login com e-mail e senha (Firebase Auth).
- Tipos de equipamento da v2.0.0: apenas `informatica` e `outros`.
- Status: `Recebido`, `Em diagnóstico`, `Aguardando aprovação`, `Em andamento`, `Aguardando peça`, `No terceiro`, `Concluído`, `Entregue ao cliente`, `Sem conserto – peças aproveitadas`, `Sem conserto – devolvido ao cliente`.
- O cliente vê no PDF **somente** o valor cobrado; custo do terceiro e margem nunca saem no PDF.
- `relatoCliente` nunca é sobrescrito por `diagnostico`.
- Todo documento criado/editado/excluído gera entrada em `log` (quem, quando, antes/depois). `log` é imutável (sem update/delete nas regras).
- Pasta `backup/` e `.superpowers/` ficam no `.gitignore` (o backup contém PINs e senhas em texto puro).
- Lixeira recuperável e novos tipos de equipamento ficam **fora** da fase 1.

## Review Focus

- Dois equipamentos com o mesmo nº de série digitado diferente (`abc-123` vs `ABC 123`) devem ser detectados como duplicata (Task 2, `normalizeSerial`).
- Serviço terceirizado sem custo informado: margem aparece como "—", nunca `NaN` ou número negativo enganoso (Task 2, `calcMargem`).
- Prazo do terceiro estourado ou sem data de envio: não quebra a tela inicial (Task 2, `diasRestantes`).
- Usuário logado mas sem documento em `usuarios/` não lê nem escreve nada (Task 4).
- Tentativa de editar ou apagar uma entrada de `log` é negada (Task 4).
- Dado antigo sem equipamento, com patrimônio vazio ou data inválida não derruba a migração; vai para o relatório de pendências (Task 3).
- PDF de serviço sem terceiro, sem recomendações ou sem diagnóstico (como os notebooks Acer/Lenovo) sai sem seções vazias (Task 10).
- Dois cadastros simultâneos de serviço não geram o mesmo número `OS-XXXX` (Task 5).

---

## File Structure

```
index.html                  shell mínimo; carrega css/app.css e src/main.js
manifest.webmanifest, sw.js PWA (instalável)
css/app.css                 estilos (extraídos do index.html atual, tema claro/escuro mantido)
package.json                "version": "2.0.0", script "test"
CHANGELOG.md
firestore.rules, storage.rules, firebase.json
src/version.js              APP_VERSION
src/main.js                 bootstrap + roteador por hash
src/firebase.js             init do app, auth, db
src/auth.js                 login/logout/onUser
src/domain/status.js        STATUS_LIST, ETAPAS, helpers
src/domain/serial.js        normalizeSerial
src/domain/validators.js    validateCliente/Equipamento/Servico, findDuplicateEquip
src/domain/finance.js       calcMargem, totalAReceber
src/domain/prazo.js         diasRestantes, estaAtrasado, precisaAtencao
src/domain/audit.js         diffCampos, buildLogEntry
src/domain/inconsistencias.js  findInconsistencias
src/data/store.js           caches em memória + onSnapshot
src/data/repo.js            saveCliente/saveEquipamento/saveServico/removeX (com log)
src/migration/transform.js  transformBackup(backup) -> {dados, pendencias}
src/pdf/relatorio.js        buildRelatorioModel (puro) + renderRelatorioPDF
src/views/*.js              login, home, servico, equipamentos, clientes, conferencia
scripts/backup.mjs          exporta Firestore atual para backup/
scripts/migrate.mjs         lê backup/, grava no Firestore novo
scripts/criar-usuario.mjs   cria documento usuarios/{uid}
tests/*.test.mjs, tests/rules/*.test.mjs
```

---

### Task 1: Base do projeto, backup e proteção de dados sensíveis

**Files:**
- Create: `package.json`, `.gitignore`, `CHANGELOG.md`, `src/version.js`, `scripts/backup.mjs`, `tests/smoke.test.mjs`
- Create (gerado, fora do git): `backup/2026-11-08/{clientes,equipamentos,ordens,tecnicos,config}.json`

**Interfaces:**
- Produces: `APP_VERSION: string` (`export const APP_VERSION = '2.0.0'` em `src/version.js`); script `npm test` que roda `node --test tests/`.

- [ ] **Step 1: Write the failing test** em `tests/smoke.test.mjs`: importa `APP_VERSION` de `../src/version.js` e `assert.match(APP_VERSION, /^2\.\d+\.\d+$/)`; lê `package.json` e `assert.equal(pkg.version, APP_VERSION)`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Criar** `package.json` (`"type":"module"`, `version: "2.0.0"`, script `test`), `src/version.js`, `.gitignore` com `backup/`, `.superpowers/`, `node_modules/`, `*.log`, e `CHANGELOG.md` com a seção `## v2.0.0 — em desenvolvimento`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Implement** `scripts/backup.mjs`: entra no Firestore **atual** com `signInAnonymously` (as regras antigas permitem), lê as coleções `clientes`, `equipamentos`, `ordens`, `tecnicos` e o doc `config/auth`, e grava um JSON por coleção em `backup/AAAA-MM-DD/`. Usa `firebase-config.js` existente.
- [ ] **Step 6: Run** `node scripts/backup.mjs` — Expected: imprime a contagem por coleção e cria os arquivos (esperado ≈ 12 equipamentos e 12 ordens). Conferir que `git status` **não** lista `backup/`.
- [ ] **Step 7: Commit** `chore: base do projeto v2.0.0 e backup dos dados antigos`.

---

### Task 2: Regras de negócio puras

**Files:**
- Create: `src/domain/{status,serial,validators,finance,prazo,audit}.js`
- Test: `tests/{serial,validators,finance,prazo,audit}.test.mjs`

**Interfaces:**
- Produces:
  - `STATUS_LIST: string[]`, `STATUS_ABERTOS: string[]` (não concluídos), `ETAPAS: string[]` (caminho do topo da ficha: `Recebido, Em diagnóstico, Aguardando aprovação, Em andamento, No terceiro, Concluído, Entregue ao cliente`).
  - `normalizeSerial(s: string): string` — maiúsculas, remove espaços, hífens e pontos.
  - `validateCliente(c): {ok:boolean, erros:string[]}` (nome obrigatório).
  - `validateEquipamento(e): {ok, erros}` (nome, `clienteId` e `tipo ∈ {informatica, outros}` obrigatórios).
  - `validateServico(s): {ok, erros}` (`clienteId`, `equipamentoId`, `relatoCliente`, `dataEntrada`, `status ∈ STATUS_LIST` obrigatórios; `valorCobrado` número ≥ 0 ou vazio).
  - `findDuplicateEquip(lista, novo): Equipamento|null` — mesmo `clienteId` e (mesma `serieNorm` não vazia **ou** mesmo nome normalizado sem série em ambos).
  - `calcMargem({valorCobrado, terceiro}): number|null` — `valorCobrado - terceiro.custo`; `null` se faltar qualquer um.
  - `totalAReceber(servicos): number` — soma `valorCobrado` de serviços `Concluído`/`Entregue ao cliente` com `pago !== true`.
  - `diasRestantes(terceiro, hoje: string): number|null` — `prazoDias - dias desde enviadoEm`; `null` sem `enviadoEm` ou sem `prazoDias`.
  - `precisaAtencao(servico, hoje): {motivo:string}|null` — motivos: `Prazo do terceiro estourado`, `Previsão de entrega vencida`, `Concluído e não pago`.
  - `diffCampos(antes, depois): {campo,antes,depois}[]` — ignora campos iguais; compara objetos aninhados por caminho `terceiro.custo`.
  - `buildLogEntry({entidade, entidadeId, acao, antes, depois, usuario, agora}): LogEntry` com `{id, em, por:{uid,nome}, entidade, entidadeId, acao, mudancas}`.

- [ ] **Step 1: Write failing tests** (um arquivo por módulo) com estes casos exatos:
  - `normalizeSerial('abc-123 x.9') === 'ABC123X9'`; `normalizeSerial('') === ''`.
  - `findDuplicateEquip` acha duplicata entre séries `'abc-123'` e `'ABC 123'` do mesmo cliente; **não** acha com clientes diferentes; não acha quando as duas séries são vazias e os nomes diferem.
  - `calcMargem({valorCobrado:650, terceiro:{custo:400}}) === 250`; `calcMargem({valorCobrado:650, terceiro:null}) === null`; `calcMargem({valorCobrado:650, terceiro:{}}) === null`.
  - `totalAReceber`: dois serviços concluídos (100 e 300), um pago → `300`; serviço `Em andamento` não entra.
  - `diasRestantes({enviadoEm:'2026-10-04', prazoDias:60}, '2026-11-08') === 25`; sem `enviadoEm` → `null`; prazo estourado retorna número negativo.
  - `precisaAtencao` devolve motivo para terceiro estourado, previsão vencida e concluído-não-pago; `null` para serviço em dia.
  - `diffCampos({a:1,terceiro:{custo:1}},{a:1,terceiro:{custo:2}})` → `[{campo:'terceiro.custo',antes:1,depois:2}]`.
  - `validateServico` rejeita status fora de `STATUS_LIST` e `valorCobrado: -5`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** cada módulo com as assinaturas acima, sem importar nada de navegador ou Firebase. Datas são strings `AAAA-MM-DD`; comparar via `Date.UTC` para evitar fuso.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: regras de negócio puras (série, validação, margem, prazo, log)`.

---

### Task 3: Migração dos dados antigos

**Files:**
- Create: `src/migration/transform.js`, `scripts/migrate.mjs`
- Test: `tests/transform.test.mjs`, `tests/fixtures/backup-exemplo/*.json`

**Interfaces:**
- Consumes: `normalizeSerial`, `STATUS_LIST` (Task 2).
- Produces: `transformBackup(backup: {clientes, equipamentos, ordens}): {clientes, equipamentos, servicos, pendencias: {tipo:string, id:string, detalhe:string}[]}`.

Regras de transformação (decididas no design): remover `pin` dos clientes; mover `cpu/ram/armazenamento/gpu/tela/so/licenca` de equipamento para `specs`; `tipo` antigo `Notebook`/`Desktop` → `informatica`, `Periférico`/`Outro` → `outros`; `serie` vazia (campo novo), `serieNorm = ''`; `ordens` → `servicos` mapeando `defeitoRelatado→relatoCliente`, `diagnosticoTecnico→diagnostico`, `valorOrcamento` (texto `R$ 150,00`) → `valorCobrado` número, `dataEntrada` vazia → `dataConclusao` quando existir, `historico` preservado, `acoes: []`, `recomendacoes: []`, `terceiro: null`, `pago: false`; unir equipamentos duplicados (mesmo cliente e mesmo nome normalizado e mesmo patrimônio) mantendo o primeiro e reapontando os serviços.

- [ ] **Step 1: Write failing test** `tests/transform.test.mjs` com a fixture (3 clientes/equipamentos/ordens, incluindo: um equipamento duplicado, uma ordem sem `equipamentoId`, uma com `valorOrcamento: 'R$ 150,00'`, uma com data inválida). Asserções: duplicata vira 1 equipamento e a ordem aponta para ele; `valorCobrado === 150`; ordem sem equipamento **não** entra em `servicos` e aparece em `pendencias` com `tipo:'servico-sem-equipamento'`; data inválida gera pendência `data-invalida` mas o serviço é migrado; nenhum cliente de saída tem a chave `pin`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `transformBackup` conforme as regras acima (função pura).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Implement** `scripts/migrate.mjs`: lê `backup/<data>/*.json`, roda `transformBackup`, grava `backup/<data>/pendencias.json`, imprime resumo e, **só com a flag `--aplicar`**, escreve em `clientes`, `equipamentos`, `servicos` (mesmos ids) usando o login do dono (e-mail/senha por variáveis de ambiente `OS_EMAIL`/`OS_SENHA`) e registra uma entrada de `log` por documento criado (`acao:'migrar'`). Sem `--aplicar` é um ensaio e não escreve nada.
- [ ] **Step 6: Run** `node scripts/migrate.mjs` (ensaio) sobre o backup real — Expected: resumo com contagens e `pendencias.json`. **Mostrar o resumo ao dono para conferência antes de aplicar** (aplicação ocorre na Task 12).
- [ ] **Step 7: Commit** `feat: migração dos dados antigos com ensaio e relatório de pendências`.

---

### Task 4: Banco trancado — login, regras e usuários

**Files:**
- Create/Modify: `firestore.rules`, `storage.rules`, `firebase.json`, `scripts/criar-usuario.mjs`
- Test: `tests/rules/rules.test.mjs`

**Interfaces:**
- Produces: coleções `usuarios/{uid}` `{nome, email, role:'admin'}`, `clientes`, `equipamentos`, `servicos`, `log`, `config/counters`.

Regras (decididas no design): acesso a qualquer coleção só se `request.auth != null` **e** existir `usuarios/{request.auth.uid}`; `log` permite apenas `create` e `read`; `usuarios` é só leitura do próprio documento (criação pelo script/console); coleções legadas (`ordens`, `tecnicos`, `config/auth`) sem acesso nenhum. `storage.rules` com a mesma condição de membro.

- [ ] **Step 1: Write failing tests** em `tests/rules/rules.test.mjs` com `@firebase/rules-unit-testing`: (a) anônimo não lê `clientes`; (b) logado **sem** documento em `usuarios` não lê nem escreve `servicos`; (c) usuário membro lê e escreve `servicos`; (d) membro **não** consegue `update` nem `delete` em `log`, mas consegue `create`; (e) ninguém lê `tecnicos` nem `config/auth`.
- [ ] **Step 2: Run** `npx firebase emulators:exec --only firestore "node --test tests/rules/"` — Expected: FAIL (regras antigas).
- [ ] **Step 3: Implement** `firestore.rules` e `storage.rules` conforme acima, mais `firebase.json` apontando para eles e para o emulador do Firestore.
- [ ] **Step 4: Run** o mesmo comando — Expected: PASS.
- [ ] **Step 5: Implement** `scripts/criar-usuario.mjs <email> <nome>`: grava `usuarios/{uid}` (uid obtido por login com `OS_EMAIL`/`OS_SENHA` do próprio usuário, ou informado por argumento).
- [ ] **Step 6: Ação do dono (guiar passo a passo, com prints se pedir):** no Console do Firebase ativar **Authentication → E-mail/senha** e desativar o provedor **Anônimo**; criar os usuários do dono e do sócio; criar o doc `usuarios/{uid}` de cada um; publicar as regras (`npx firebase deploy --only firestore:rules,storage` ou colar no console).
- [ ] **Step 7: Verify:** com as regras publicadas, `node scripts/backup.mjs` deve **falhar** com permissão negada (prova que o banco foi trancado). Commit `feat: regras de segurança por membro e log imutável`.

---

### Task 5: Camada de dados, login e gravação com log

**Files:**
- Create: `src/firebase.js`, `src/auth.js`, `src/data/store.js`, `src/data/repo.js`
- Test: `tests/rules/repo.test.mjs` (emulador)

**Interfaces:**
- Consumes: `buildLogEntry` (Task 2), regras (Task 4).
- Produces:
  - `signIn(email, senha): Promise<User>`, `signOut(): Promise<void>`, `onUser(cb: (user|null)=>void): unsubscribe`.
  - `store`: `{ clientes, equipamentos, servicos, usuarios }` (arrays vivos) e `subscribeAll(onChange: ()=>void): unsubscribe`.
  - `repo.saveCliente(c)`, `repo.saveEquipamento(e)`, `repo.saveServico(s)`, `repo.removeEquipamento(id)`, `repo.removeCliente(id)`, `repo.removeServico(id)` — cada um grava o documento **e** o `log` na mesma `writeBatch`/transação, devolvendo o objeto salvo. `saveServico` sem `id` reserva `OS-XXXX` em transação sobre `config/counters`.
  - `repo.nextOsId(): Promise<string>` — formato `OS-0001`, sequencial, sem repetição sob concorrência.

- [ ] **Step 1: Write failing test** (emulador): `saveServico` novo gera `OS-0001` e um doc em `log` com `acao:'criar'`; editar um campo gera `log` com `mudancas` contendo só aquele campo; duas chamadas simultâneas a `nextOsId` retornam números diferentes; `removeEquipamento` com serviço vinculado rejeita com erro de mensagem em português.
- [ ] **Step 2: Run** `npx firebase emulators:exec --only firestore "node --test tests/rules/repo.test.mjs"` — Expected: FAIL.
- [ ] **Step 3: Implement** os módulos acima. `store.js` usa `onSnapshot` por coleção (atualização em tempo real, substitui o carregamento total do sistema antigo). `repo.js` valida com Task 2 antes de gravar e lança `Error` com a lista de erros.
- [ ] **Step 4: Run** o comando do Step 2 — Expected: PASS.
- [ ] **Step 5: Commit** `feat: login, store em tempo real e repo com log atômico`.

---

### Task 6: Casca do aplicativo, tela de login, PWA e rodapé de versão

**Files:**
- Create: `css/app.css`, `src/main.js`, `src/views/login.js`, `manifest.webmanifest`, `sw.js`
- Modify: `index.html` (reduzir a casca; manter fontes e CDNs de jsPDF/autotable)

**Interfaces:**
- Consumes: `signIn`, `onUser`, `subscribeAll`, `APP_VERSION`.
- Produces: roteador por hash `#/inicio`, `#/servico/:id`, `#/equipamentos`, `#/clientes`, `#/conferencia`; `registerView(rota: string, render: (container, params)=>void)` em `src/main.js`; barra lateral no computador e barra inferior no celular; rodapé com `v{APP_VERSION}`.

- [ ] **Step 1: Implement** `css/app.css` a partir dos estilos atuais do `index.html` (tema escuro/claro e cores mantidos), adicionando layout **desktop-first** com breakpoint ≤ 820 px que troca a lateral por barra inferior.
- [ ] **Step 2: Implement** `src/main.js` e `src/views/login.js` (e-mail + senha, mensagem em português para senha errada), `manifest.webmanifest` (nome "Garage 1240 · O.S.", ícones de `assets/`), `sw.js` (cache só do shell estático; **dados nunca em cache**).
- [ ] **Step 3: Verify no navegador** (servir com `npx serve .` e usar o navegador do app): login com usuário válido entra; senha errada mostra "E-mail ou senha incorretos."; rodapé mostra `v2.0.0`; em 375 px a navegação vira barra inferior; sem erros no console.
- [ ] **Step 4: Commit** `feat: casca do app, login por e-mail, PWA e versão no rodapé`.

---

### Task 7: Clientes e Equipamentos

**Files:**
- Create: `src/views/clientes.js`, `src/views/equipamentos.js`

**Interfaces:**
- Consumes: `repo.*`, `store`, `validateCliente`, `validateEquipamento`, `findDuplicateEquip`, `normalizeSerial`.
- Produces: listas com busca e formulários em modal; `openEquipamentoForm(id|null, clienteId?, onSaved?)` reutilizável pela ficha do serviço.

Comportamento fixo: formulário de equipamento mostra o bloco de especificações (CPU, RAM, armazenamento, GPU, tela, SO, licença) **só** quando `tipo === 'informatica'`; `serie` é salvo junto de `serieNorm = normalizeSerial(serie)`; ao salvar novo equipamento duplicado, mostra aviso com "Editar o existente" (sem botão de ignorar quando a série coincide); clientes não têm PIN; exclusão com vínculos é bloqueada com a mensagem do `repo`.

- [ ] **Step 1: Implement** as duas telas conforme o comportamento acima, busca por nome, cliente, **série** e patrimônio.
- [ ] **Step 2: Verify no navegador:** cadastrar equipamento com série `abc-123`, tentar cadastrar outro com `ABC 123` para o mesmo cliente → aviso de duplicata; trocar o tipo para `outros` esconde as especificações; busca por série encontra o aparelho.
- [ ] **Step 3: Commit** `feat: cadastro de clientes e equipamentos com detecção de duplicidade`.

---

### Task 8: Ficha do serviço (página única)

**Files:**
- Create: `src/views/servico.js`

**Interfaces:**
- Consumes: `repo.saveServico`, `ETAPAS`, `calcMargem`, `diasRestantes`, `validateServico`, `openEquipamentoForm`, `renderRelatorioPDF` (Task 10, ligado lá).
- Produces: rota `#/servico/novo` e `#/servico/:id`.

Layout aprovado (opção A): faixa de etapas no topo (etapa atual destacada, clicável para mudar o status); depois **Relato do cliente** (nunca sobrescrito), **Diagnóstico**, **Ações realizadas** (lista editável), **Recomendações** (lista editável), bloco **Terceiro** (visível só quando status é `No terceiro` ou já existe terceiro: nome, contato, datas de cada etapa, prazo em dias, custo, garantia), bloco de **valores** (cobrado, custo do terceiro, sobra = `calcMargem`, pago + data), garantia (dias), datas (entrada, início, previsão, conclusão) e **Histórico de alterações** lido de `log` por `entidadeId`. Botões: Salvar, Gerar relatório PDF.

- [ ] **Step 1: Implement** a tela conforme acima; margem mostra "—" quando `calcMargem` for `null`; campo de prazo mostra "restam N dias" ou "estourou há N dias" via `diasRestantes`.
- [ ] **Step 2: Verify no navegador:** criar serviço de teste com terceiro (custo 400, cobrado 650) → "Sobra R$ 250,00"; remover o custo → "—"; editar o diagnóstico e conferir a nova linha no Histórico; abrir em 375 px sem rolagem horizontal.
- [ ] **Step 3: Commit** `feat: ficha de serviço em página única com terceirização e financeiro manual`.

---

### Task 9: Tela inicial (painel de atenção + busca)

**Files:**
- Create: `src/views/home.js`

**Interfaces:**
- Consumes: `store`, `precisaAtencao`, `totalAReceber`, `STATUS_ABERTOS`.
- Produces: rota `#/inicio` (padrão após login).

Layout aprovado (A + busca da C): barra de busca no topo (cliente, equipamento, **nº de série**, nº da O.S.) com resultados em lista; botão "Novo serviço"; quatro cartões (Em andamento, No terceiro, Aguardando aprovação, A receber em R$); lista **Precisa de atenção** ordenada por urgência, cada item com o motivo e link para a ficha.

- [ ] **Step 1: Implement** a tela. Resultado da busca limitado a 20 itens, ignorando acentos e maiúsculas.
- [ ] **Step 2: Verify no navegador:** com os dados migrados de teste no emulador/ambiente, cartões batem com a contagem; serviço concluído sem pagamento aparece em "Precisa de atenção"; busca por série parcial encontra o equipamento.
- [ ] **Step 3: Commit** `feat: tela inicial com painel de atenção e busca global`.

---

### Task 10: Relatório em PDF

**Files:**
- Create: `src/pdf/relatorio.js`
- Test: `tests/relatorio.test.mjs`
- Modify: `src/views/servico.js` (botão), `src/views/home.js` (atalho "Relatório" na lista, opcional)

**Interfaces:**
- Consumes: servico, equipamento, cliente.
- Produces: `buildRelatorioModel({servico, equipamento, cliente, hoje}): {titulo, numero, dataEmissao, cliente:{nome}, periodo:string, status, equipamento:{nome, linhaSpecs}, secoes:{titulo,tipo:'texto'|'lista',conteudo}[], garantiaTexto:string|null, valor:string|null}` e `renderRelatorioPDF(model): Promise<void>` (jsPDF, baixa `relatorio-OS-XXXX.pdf`).

Layout aprovado: cabeçalho com logo/`GARAGE 1240`, cliente/período/status, caixa do equipamento com configuração, seções Problema, Diagnóstico, Ações realizadas, Recomendações, rodapé com garantia, contato e valor. `periodo` = `"05 a 07/11/2026"` quando há início e conclusão, ou a data única.

- [ ] **Step 1: Write failing tests:** (a) modelo do exemplo PC Gigabyte (início 2026-11-05, conclusão 2026-11-07, valor 300) → `periodo === '05 a 07/11/2026'`, `valor === 'R$ 300,00'`, seções Problema/Diagnóstico/Ações/Recomendações presentes; (b) exemplo Acer (sem diagnóstico, sem recomendações, 100) → **sem** seções `Diagnóstico` e `Recomendações`; (c) serviço com terceiro (`custo:400`, `valorCobrado:650`) → `JSON.stringify(model)` **não contém** `400` como custo nem as palavras `custo`, `margem`, `terceiro`; (d) sem `valorCobrado` → `valor === null`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `buildRelatorioModel` (pura) e `renderRelatorioPDF` (jsPDF + autotable via `window.jspdf`, logo de `assets/logo-pdf.png`).
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Verify no navegador:** gerar o PDF do serviço de teste e abrir; conferir visualmente contra o desenho aprovado; testar também o download no celular (375 px).
- [ ] **Step 6: Commit** `feat: relatório de serviço em PDF sem dados internos`.

---

### Task 11: Tela de conferência de dados

**Files:**
- Create: `src/domain/inconsistencias.js`, `src/views/conferencia.js`
- Test: `tests/inconsistencias.test.mjs`

**Interfaces:**
- Produces: `findInconsistencias({clientes, equipamentos, servicos}): {tipo:string, id:string, mensagem:string}[]` — tipos: `servico-sem-equipamento`, `equipamento-sem-cliente`, `equipamento-duplicado` (por série ou nome), `concluido-sem-valor`, `terceiro-sem-prazo`, `data-invalida`.

- [ ] **Step 1: Write failing test** com um conjunto contendo um caso de cada tipo e um conjunto limpo (`[]` esperado).
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `findInconsistencias` e a tela (lista agrupada por tipo, cada item com link para o registro; selo com contagem no menu).
- [ ] **Step 4: Run** `npm test` — Expected: PASS. Commit `feat: tela de conferência de dados`.

---

### Task 12: Migração real, limpeza do legado e publicação v2.0.0

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `index.html`/`sw.js` (versão do cache)
- Remove (do Firestore, após aprovação): coleções `ordens`, `tecnicos`, doc `config/auth`

- [ ] **Step 1: Mostrar ao dono** o ensaio da migração (`node scripts/migrate.mjs`) e `pendencias.json`; resolver pendências junto com ele.
- [ ] **Step 2: Aplicar:** `OS_EMAIL=… OS_SENHA=… node scripts/migrate.mjs --aplicar`; abrir a tela de conferência e confirmar que está vazia ou só com pendências conhecidas.
- [ ] **Step 3: Percorrer a lista de verificação com o dono no app publicado local:** login, novo cliente, novo equipamento com série duplicada, novo serviço, terceirização, pagamento, PDF, busca, celular (375 px), tema claro/escuro, sair.
- [ ] **Step 4: Após o OK do dono**, apagar do Firestore as coleções legadas `ordens`, `tecnicos` e `config/auth` (o backup em `backup/` permanece).
- [ ] **Step 5: Atualizar** `README.md` (como entrar, como criar usuário, como publicar regras, como fazer backup) e fechar a entrada `## v2.0.0` no `CHANGELOG.md`, com a data.
- [ ] **Step 6: Commit, tag e publicação:** `git commit -m "release: v2.0.0"`, `git tag v2.0.0`, push de `main` e da tag (**somente com autorização do dono**), conferir o site no GitHub Pages.

---

## Self-Review

- **Cobertura do design:** tela inicial A+busca (T9), ficha A (T8), PDF (T10), terceirização e margem (T2/T8), financeiro manual (T8), log (T2/T4/T5), login real e banco trancado (T4/T5/T6), tipos de equipamento reduzidos e série (T7), migração e backup (T1/T3/T12), versionamento (T1/T12), PWA e desktop-first (T6), tela de conferência (T11), fases 2 e 3 fora do plano. Entrada por arquivo/skill (fase 2) e lixeira ficam de fora, conforme o design.
- **Consistência de tipos:** `normalizeSerial`, `calcMargem`, `diasRestantes`, `precisaAtencao`, `buildLogEntry` e `repo.*` têm a mesma assinatura em todas as tarefas que os consomem; status e etapas vêm sempre de `src/domain/status.js`.
- **Ordem:** a Task 4 tranca o banco antes de existir qualquer tela nova; a migração (T3) só é aplicada na T12 depois de login e regras prontos. Isso é intencional: o sistema antigo deixa de funcionar na T4, o que é aceitável porque ninguém o usa hoje.

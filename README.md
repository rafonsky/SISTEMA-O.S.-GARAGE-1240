# Garage 1240 · Ordens de Serviço (v2)

Aplicativo interno da Garage 1240 para controlar equipamentos, serviços (inclusive terceirizados), valores e relatórios em PDF.
Site estático (GitHub Pages) + Firebase (Firestore e login por e-mail/senha). Sem servidor próprio e sem custo.

A versão do app aparece no rodapé da barra lateral. O histórico de mudanças está em [CHANGELOG.md](CHANGELOG.md).

## Como usar no dia a dia

- **Início:** busca (cliente, equipamento, nº de série ou O.S.), botão "Novo serviço" e a lista "Precisa de atenção".
- **Serviço:** página única com etapas, relato do cliente, diagnóstico, ações, recomendações, terceirização, valores e histórico de alterações. "Gerar relatório (PDF)" cria o relatório para o cliente; ele nunca mostra custo do terceiro nem margem.
- **Equipamentos e Clientes:** cadastro com aviso de duplicidade (o nº de série é a identidade do aparelho).
- **Conferência:** aponta dados fora do padrão (duplicados, serviços sem equipamento, concluídos sem valor, datas inválidas).
- **Celular:** funciona no navegador e pode ser instalado na tela inicial; a barra de navegação fica embaixo.

## Entrar pela primeira vez / liberar o sócio

1. No Console do Firebase, **Authentication → Método de login**: ative **E-mail/senha** e desative **Anônimo**.
2. **Authentication → Usuários → Adicionar usuário**: crie um usuário para cada pessoa (e-mail e senha). Copie o **UID** de cada um.
3. **Firestore Database → Iniciar coleção** `usuarios`: crie um documento por pessoa, com o **ID igual ao UID**, e os campos `nome` (texto), `email` (texto) e `role` (texto: `admin`).
   Sem esse documento, o login funciona, mas o app recusa o acesso e nada é lido ou gravado.

## Ordem de publicação (importante)

O site no GitHub Pages passa a usar o código novo assim que a branch `main` é atualizada. Portanto, **antes** de fazer o merge em `main`: (1) crie os usuários e os documentos `usuarios/`, (2) publique as regras novas, (3) rode a migração. Enquanto as regras antigas estiverem ativas, os dados do sistema anterior (PINs, senhas dos técnicos, CPF/CNPJ) continuam acessíveis a qualquer visitante.

## Publicar as regras de segurança

As regras ficam em `firestore.rules` e `storage.rules`. Com a CLI do Firebase instalada e logada:

```bash
npx firebase deploy --only firestore:rules,storage
```

Ou cole o conteúdo de cada arquivo em **Firestore → Regras** e **Storage → Regras** no Console.
Teste as regras antes de publicar com `npm run test:rules` (usa o emulador local).

## Rodar e testar no computador (sem tocar nos dados reais)

```bash
npm install
npm test                  # testes das regras de negócio, migração e PDF
npm run test:rules        # regras de segurança e gravação com log (emulador do Firebase)
```

Para abrir o app com dados de teste:

```bash
npx firebase emulators:start --only firestore,auth --project demo-os-garage
node scripts/dev-seed.mjs     # em outro terminal: cria dev@teste.com / senha123 e carrega os dados do backup
node scripts/serve.mjs 5173   # em outro terminal
```

Abra `http://localhost:5173/?emulador`. O `?emulador` faz o app usar só os emuladores locais.

## Backup e migração dos dados antigos

```bash
node scripts/backup.mjs                  # só funciona enquanto as regras antigas estiverem ativas
node scripts/migrate.mjs                 # ENSAIO: mostra o que seria migrado e grava pendencias.json
OS_EMAIL=... OS_SENHA=... node scripts/migrate.mjs --aplicar   # grava no Firestore (use o login do dono)
```

A pasta `backup/` fica fora do git de propósito: contém PINs e senhas em texto puro do sistema antigo.

## Estrutura

- `src/domain/` regras de negócio puras (testadas): status, série, validação, margem, prazos, log, painel, conferência.
- `src/data/` acesso ao Firestore: `repo.js` grava o documento **e** o log na mesma transação.
- `src/views/` telas. `src/pdf/` conteúdo e desenho do relatório.
- `src/migration/` transformação dos dados do sistema antigo.
- `css/`, `index.html`, `manifest.webmanifest`, `sw.js`: interface e instalação no celular.

## Versões

Formato `v2.X.Y`: correção pequena sobe o último número; função nova sobe o do meio; mudança grande no jeito de guardar os dados sobe o primeiro. Cada versão ganha uma tag no git (`v2.0.1`) e uma entrada no CHANGELOG.

# Portal de Acompanhamento de O.S. — Firestore + GitHub Pages

Site estático (`index.html` + `app.js`) que usa o **Firestore** (seu projeto Firebase)
como banco de dados. Sem servidor próprio — dá pra hospedar de graça no GitHub Pages.

## Arquivos

- `index.html` — página e estilo visual
- `app.js` — toda a lógica (login por PIN/senha, telas, leitura/escrita no Firestore)
- `firebase-config.js` — **você precisa preencher** com os dados do seu projeto Firebase
- `firestore.rules` — regra de segurança do banco (cole no Console do Firebase)

## Passo 1 — Criar o projeto no Firebase

1. Acesse https://console.firebase.google.com e crie um projeto novo (ex: `garage1240-os`).
2. No menu lateral, vá em **Build > Firestore Database** → **Criar banco de dados** →
   modo **produção** → escolha a região (ex: `southamerica-east1` para o Brasil).
3. Ainda no menu lateral, vá em **Build > Authentication** → **Sign-in method** →
   ative o provedor **Anônimo**. (O app usa isso só para autenticar o navegador antes
   de ler/escrever no banco — o cliente/oficina continuam entrando por PIN/senha na tela.)

## Passo 2 — Pegar as credenciais do app

1. No Console do Firebase, clique no ícone de engrenagem (⚙) → **Configurações do projeto**.
2. Em **Seus apps**, clique em **Adicionar app > Web** (ícone `</>`), dê um nome e finalize.
3. Copie o objeto `firebaseConfig` que aparece na tela.
4. Cole no arquivo `firebase-config.js` (substituindo os valores de exemplo).

Essas chaves **não são secretas** — é o padrão do Firebase para apps web. Quem protege
os dados de verdade é a regra do Firestore (próximo passo), não essa chave.

## Passo 3 — Aplicar as regras de segurança

1. No Console do Firebase, vá em **Firestore Database > Regras**.
2. Apague o conteúdo padrão e cole o conteúdo do arquivo `firestore.rules` deste projeto.
3. Clique em **Publicar**.

Isso garante que só quem passar pelo app (autenticação anônima) consegue ler ou
escrever no banco — evita que alguém acesse os dados direto pela API do Firestore.

## Passo 4 — Subir para o GitHub

No terminal, dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "Portal de O.S. com Firestore"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

(Troque `SEU-USUARIO/SEU-REPO` pelo repositório que você criar no GitHub.)

## Passo 5 — Publicar com GitHub Pages

1. No repositório, vá em **Settings > Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Branch: `main`, pasta: `/ (root)`. Salvar.
4. Em alguns minutos o site fica disponível em:
   `https://SEU-USUARIO.github.io/SEU-REPO/`

## Acessos padrão (trocar depois de publicar)

- **PIN do cliente "Stage Audio Visual":** `2026`
- **Senha da oficina (admin):** `garage1240`

Ambos podem ser trocados direto pelo painel administrativo (abas **Clientes** e
**Configurações**) — fica salvo no Firestore, não precisa mexer no código.

## Sobre segurança

Isso continua sendo um app **client-side** (sem servidor próprio): a regra do
Firestore bloqueia acesso de fora do app, mas alguém que abrir o código-fonte do site
(F12 no navegador) tecnicamente consegue ver como os dados são lidos e, com esforço,
replicar chamadas ao Firestore. Para o que você está usando (rastrear status de
equipamento, sem dado financeiro/pessoal sensível), esse nível é adequado. Se um dia
quiser autenticação mais forte (login de verdade por e-mail/senha em vez de PIN
compartilhado, por exemplo), é uma evolução natural a partir daqui.

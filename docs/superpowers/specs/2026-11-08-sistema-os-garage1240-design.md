# Sistema de O.S. da Garage 1240 — Design

Data: 2026-11-08 · Status: **aguardando aprovação do dono**

## 1. Intenção e porquê

A Garage 1240 (manutenção de informática e audiovisual) tem hoje um portal de O.S. abandonado. Ele foi feito em Firebase + GitHub Pages, tem um login frágil e foi deixado de lado depois que o sócio lançou dados fora do padrão e os relatórios deixaram de bater.

O objetivo é **recuperar o sistema e transformá-lo em um aplicativo de uso diário** para o dono (uso principal) e o sócio (uso eventual). O critério de sucesso do dono: *daqui a 3 meses o sistema está rodando com muita manutenção*, usado de verdade.

O que torna o projeto especial:
- Os relatórios de serviço entregues ao cliente nascem de conversas com o Claude. O sistema precisa receber esse resultado sem exigir redigitação.
- Parte dos consertos é **terceirizada** (prazos de até 60 dias), e o dono quer ver o quanto sobra em cada serviço.
- O dono também consulta e exporta informações pelo celular, na rua, na frente do cliente.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
- Cadastrar equipamentos, clientes e serviços de forma rápida e difícil de errar.
- Controlar o ciclo completo do serviço, incluindo terceirização e prazos.
- Mostrar valor cobrado, custo do terceiro, margem e se foi pago (campo manual).
- Gerar o relatório de serviço em PDF com um clique.
- Manter log de toda alteração (quem, quando, antes/depois).
- Funcionar bem no computador e permitir consulta e exportação no celular.

**Não-objetivos (primeira versão)**
- Portal para o cliente acompanhar o serviço. Fica para depois. Ninguém depende do portal atual.
- Integração com pagamento ou emissão de nota fiscal.
- Estoque de peças.

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Dados inconsistentes, duplicados ou relatórios que não batem.
- Sistema trabalhoso demais, que volta a ser abandonado.
- Dados pessoais ou senhas expostos a qualquer visitante (problema do sistema atual).

## 3. Restrições

- Continuar com **Firebase** (dados) e **GitHub Pages** (site). Sem custo.
- Usuários: o dono e o sócio. Ambos editam tudo.
- Interface em português do Brasil.
- Primeiro desenhada para o computador. No celular: busca, histórico, consulta e exportar PDF.
- Cloudflare existe na conta do dono e pode ser usado no futuro para um endereço próprio. Não é necessário agora.

## 4. Decisões do dono

- **Tela inicial:** *Painel de atenção* com barra de busca no topo (cliente, equipamento ou nº de série) e botão grande "Novo serviço". O painel mostra: em andamento, no terceiro, aguardando aprovação e valor a receber, mais a lista "precisa de atenção" (atrasados, parados no terceiro, concluídos não pagos).
- **Ficha do serviço:** *página única*, com o caminho do serviço em etapas no topo; relato do cliente, diagnóstico, terceiro, valores e histórico de alterações abaixo.
- **Relatório PDF:** layout aprovado (cabeçalho com logo, cliente/período/status, equipamento com configuração, problema, diagnóstico, ações, recomendações, garantia e valor). O cliente vê só o valor cobrado.
- **Relato do cliente** e **diagnóstico técnico** são campos separados. O relato original nunca é sobrescrito.
- **Terceirização:** registrar terceiro (nome/contato), datas de cada etapa (enviado, diagnóstico recebido, orçamento aprovado, em conserto, devolvido), prazo prometido com alerta, custo do terceiro, valor cobrado do cliente, margem e garantia do terceiro.
- **Financeiro:** valor cobrado em todo serviço; "pago" é campo manual.
- **Log:** toda alteração é registrada, inclusive exclusões. A **lixeira** recuperável fica para a fase 2 (decisão do dono, para a primeira versão sair mais rápida).
- **Entrada manual sempre disponível.** Além disso, importação por arquivo gerado na conversa com o Claude (entrada, saída ou serviço completo).
- **Equipamentos de vários tipos:** a primeira versão tem dois tipos, **informática** (notebook, desktop) e **outros** (inclui áudio). O tipo define quais campos aparecem. Novos tipos entram quando houver caso real. O **número de série** é campo próprio, buscável e usado para detectar duplicidade.
- **Login real** para dono e sócio, com e-mail e senha.
- **Backup:** os dados atuais do Firestore são exportados para uma pasta separada antes de qualquer mudança. Podem ser úteis no futuro.
- **Dados antigos entram no sistema novo, organizados.** Depois do backup, os dados atuais (cerca de 12 equipamentos e 12 O.S. da Stage Audio Visual) são limpos e migrados: nomes padronizados, duplicidades unidas e campos faltando destacados. O dono confere o resultado antes de valer. O backup original fica intacto em pasta separada, fora do GitHub (contém PINs e senhas em texto puro).
- A logo será refeita depois; usar a atual por enquanto.

## 5. Escolhas minhas (marcadas como minhas)

- Lista de status: Recebido, Em diagnóstico, Aguardando aprovação, Em andamento, Aguardando peça, No terceiro, Concluído, Entregue ao cliente, Sem conserto (peças aproveitadas / devolvido).
- Sistema como PWA, instalável no celular.
- Código separado em módulos pequenos, em vez do arquivo único de 2000 linhas.
- Uma tela de conferência de dados que aponta serviços sem equipamento, duplicados e valores faltando.
- Listas e campos obrigatórios no lugar de texto livre, para evitar a bagunça anterior.
- Recomendações ao cliente e lista de "ações realizadas" viram campos do serviço.

## 6. Fases sugeridas

1. **Base:** backup, trancar o banco (login e regras de segurança), migração dos dados antigos, cadastros, ficha do serviço, tela inicial, financeiro manual, log, relatório PDF.
2. **Importação e extras:** arquivo gerado na conversa com o Claude e um comando combinado para gerá-lo; lixeira recuperável.
3. **Depois:** portal do cliente (somente leitura), nova logo, endereço próprio.

## 6.1 Versionamento

Pedido do dono: versões numeradas como v2.0.1, v2.0.2, v2.0.3...

- O sistema atual é tratado como a versão 1. A reconstrução começa em **v2.0.0**.
- Formato `v2.X.Y`: correção pequena sobe o último número (v2.0.1 → v2.0.2); funcionalidade nova sobe o do meio (v2.0.x → v2.1.0); mudança que altera como os dados funcionam sobe o primeiro (v3.0.0). *(minha escolha)*
- Cada versão recebe uma **tag no git** (`v2.0.1`) e uma entrada em um arquivo `CHANGELOG.md` com o que mudou, em português. *(minha escolha)*
- O número da versão aparece discretamente no rodapé do aplicativo, para saber qual está em uso.

## 7. O que fica a critério de quem constrói

Estrutura exata das coleções do Firestore, regras de segurança por papel, bibliotecas de PDF, aparência detalhada (cores, tipografia, ícones) dentro do estilo já existente, e o formato do arquivo de importação.

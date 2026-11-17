# Histórico de versões

Formato `v2.X.Y`: correção pequena sobe o último número; função nova sobe o do meio; mudança grande no jeito de guardar os dados sobe o primeiro.

## v2.0.0 — 17/11/2026

Reconstrução do sistema como aplicativo interno da Garage 1240 (dono e sócio).

- Login real por e-mail e senha; banco trancado por regras de segurança (só membros liberados leem ou gravam).
- Tela inicial com painel de atenção, busca global (inclui nº de série) e botão de novo serviço.
- Ficha do serviço em página única: etapas, relato do cliente separado do diagnóstico, ações, recomendações.
- Terceirização: terceiro, datas de cada etapa, prazo com alerta, custo, margem e garantia.
- Valor cobrado e pagamento (campo manual) em todo serviço.
- Log de todas as alterações (quem, quando, antes e depois); histórico visível na ficha.
- Equipamentos com número de série como identidade e aviso de duplicidade; tipos Informática e Outros.
- Relatório de serviço em PDF para o cliente, sem custo nem margem; no celular abre o compartilhamento.
- Tela de conferência de dados.
- Migração dos dados do sistema anterior (com ensaio e relatório de pendências); backup em pasta separada.
- Identidade visual própria: paleta petróleo e laranja, fontes Figtree e JetBrains Mono, temas escuro, claro e OLED, nova tela de entrada e logo (monitor com prompt) no login, menu, ícone do app e PDF.
- O status "Concluído" passa a aparecer como "Pronto para retirada" (telas e PDF do cliente); o valor guardado continua o mesmo.
- Instalável no celular (PWA) e layout pensado primeiro para o computador.
- Removido o portal do cliente e o login por PIN do sistema anterior (voltam, de forma segura, numa fase futura).

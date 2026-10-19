# Planejamento e histórico de manutenção preventiva

## Fluxo na homologação

1. Como Administrador ou Gestor, abra **Manutenção → Programar preventiva**. Informe atividade, equipamento, técnico ativo, vencimento, periodicidade e checklist. Há atalhos mensal, trimestral, semestral e anual; a periodicidade personalizada aceita 1–120 meses ou 1–3.650 dias.
2. Confira as listas de vencidas e dos próximos 30 dias. O status das programadas é calculado pela data em São Paulo: vencida = Atrasada; vence hoje = Crítica; futura = Em dia. Itens antigos não são convertidos automaticamente: use **Programar** para revisar data, frequência e checklist.
3. Clique **Gerar OS**, conectado. A ordem já recebe cliente, local, equipamento, técnico, vencimento e sugestão de checklist. O código começa com OS-PREV. Só se gera uma OS em aberto por plano: clique duplo ou repetição após resposta perdida devolve a mesma OS.
4. O técnico abre a OS em Meus atendimentos e preenche o relatório. O checklist programado é sugerido somente ao iniciar um relatório novo. Fotos, componentes e medições funcionam como nas demais OS.
5. Ao concluir, o servidor grava a data da conclusão, atualiza a última manutenção do equipamento e calcula o próximo vencimento na mesma transação. Isso também ocorre na sincronização offline. O recibo idempotente impede avanço duplicado.
6. Abra **Equipamentos → equipamento → Histórico do equipamento**, ou o botão de histórico no cartão da preventiva. Há 20 atendimentos por página; relatórios completos, fotos, medições e PDF são carregados ao abrir cada atendimento. Técnicos veem somente os próprios atendimentos; administrador e gestor consultam o conjunto.

## Regra de calendário

A recorrência parte do vencimento programado, sem deslocar todo o calendário por atraso ou antecipação. Exemplo: mensal com referência no dia 31 usa 28/29 em fevereiro e retorna a 31 em março. O dia de referência é preservado ao editar os demais campos; alterar o vencimento redefine a referência.

Uma conclusão atrasada avança até o primeiro vencimento posterior ao dia local da conclusão. Não cria OS retroativas fictícias. Exemplo: plano mensal de 31/01 executado em 19/10 passa para 31/10. Se executado antes do vencimento, o próximo é o ciclo seguinte ao vencimento atendido.

## Preservação e autorização

- Não há migração de banco nem reescrita de dados antigos: programação e vínculos são campos opcionais nos registros JSON existentes. Registros antigos permanecem válidos.
- O sistema protege o vínculo da OS, o ciclo e a data da conclusão. OS preventiva concluída não pode ser reaberta nem excluída, e plano com histórico não pode ser excluído ou transferido para outro equipamento.
- Programação em execução fica bloqueada para edição até concluir a OS em aberto. Para outro equipamento, crie outro plano. Alterar a próxima data para um ciclo já executado não permite duplicá-lo.
- Gerar OS não depende de agendador nem ocorre sozinho: é ação explícita do administrador/gestor. Histórico completo e geração requerem conexão; execução de OS já preparadas continua offline. A próxima data é confirmada somente após sincronizar.
- Salvar ou revisar novamente um relatório concluído não avança o calendário. A OS conserva seu ciclo original e o PDF informa a origem preventiva, o vencimento atendido e a data da conclusão.
- Novas conclusões recebem data registrada. Relatórios antigos sem essa informação mostram o agendamento existente, sem inventar uma data histórica de conclusão.

## Validação e aceite

Testes cobrem validação de datas, bissexto, dia 31, dias/meses, atraso, antecipação, fuso local, geração repetida, escopo por técnico, perfis, paginação do histórico, metadados protegidos e rollback de OS/plano/equipamento/auditoria/recibo quando há falha na atualização. A suíte anterior de fotos, medições, relatórios, backup e offline continua obrigatória.

Aceite: programar um equipamento de ensaio, gerar a OS duas vezes e conferir um único registro, abrir como técnico, salvar relatório com foto e medição, concluir, conferir próxima data e histórico/PDF. Repetir conclusão offline e sincronizar duas vezes para verificar que a data só avança uma vez. Não integrar à main nesta etapa.

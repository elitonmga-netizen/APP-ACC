# Pendências e ações corretivas — homologação

## Do checklist à correção

1. O técnico marca **Não conforme** em um item do checklist e salva o relatório. O servidor cria uma pendência vinculada à OS, ao equipamento e ao item. Sem rede, isso ocorre ao sincronizar o rascunho.
2. **Pendências** fica no menu principal; no smartphone, abra **Mais → Pendências**. O Dashboard mostra abertas, vencidas, aguardando validação e sem prazo. Use busca, situação e filtro de vencidas para acompanhar a fila.
3. Administrador ou Gestor abre **Detalhar pendência**, define responsável, prioridade e prazo e salva. A pendência começa com prioridade Média, técnico da OS original e sem prazo; o administrador revisa esses dados antes de gerar o atendimento.
4. **Gerar OS corretiva** cria uma OS-COR com equipamento, técnico, prazo, prioridade e sugestão do checklist. Repetir a ação enquanto estiver Em correção retorna a mesma ordem. Consulta e gerenciamento de pendências requerem conexão.
5. O técnico executa em **Meus atendimentos**, registra diagnóstico e serviço executado, anexa fotos gerais ou por item e salva o relatório. Pode executar offline após preparar as OS. Concluir a OS corretiva exige o relatório da solução; depois a pendência fica **Aguardando validação**, sem fechamento automático.
6. Administrador ou Gestor consulta **Ver OS e solução**, confere fotos e medições, registra observações e aprova. A pendência passa a **Resolvida**. Se devolver para correção, volta a **Aberta**, preserva as observações e permite uma nova OS, mantendo as anteriores no histórico.

## Evidências, histórico e dados antigos

A pendência guarda uma cópia das observações e fotos daquele item na primeira identificação. Editar a inspeção posteriormente não apaga a evidência nem resolve a pendência. Há uma única pendência por combinação OS/modelo/item; novas OS podem identificar novos casos. Salvar ou sincronizar novamente não duplica nem reabre um caso resolvido.

Use **Importar não conformidades anteriores** para criar pendências de relatórios já existentes. A ação revisa os itens atualmente Não conforme e preserva pendências já criadas. Repetir a importação não duplica registros. Não há criação de pendências por uma simples consulta GET nem migração destrutiva dos dados.

Em **Equipamentos → equipamento → Histórico**, as pendências do equipamento aparecem junto aos atendimentos. A solução e as fotos são consultadas no relatório da OS corretiva, cujo PDF identifica a origem. Ordens corretivas concluídas não podem ser reabertas ou excluídas; pendências permanecem no histórico.

O prazo é uma data local de São Paulo. Vencida significa pendência ainda não resolvida com prazo anterior ao dia atual. Sem prazo não é contado como vencido e aparece separadamente no painel.

## Permissões e consistência

Administrador e Gestor configuram, geram OS e validam soluções. Técnicos consultam somente as pendências atribuídas a seu perfil; Operador tem consulta, sem gerenciar. Ao transferir a responsabilidade, o acesso à pendência acompanha o novo técnico, com as evidências necessárias à tarefa. O relatório completo da OS original continua sujeito às permissões existentes de OS.

As pendências são registros JSON no banco existente, sem mudança da versão do banco. Os backups existentes já incluem esses registros e sua auditoria. Geração da OS é transacional. Captura de não conformidades e atualização após conclusão ocorrem dentro da transação da OS, inclusive offline: falhas não deixam relatórios, auditorias ou recibos parcialmente confirmados.

## Aceite em campo

Marcar um item Não conforme com foto, salvar, conferir uma pendência e repetir o salvamento. Definir prazo, gerar a OS duas vezes e conferir uma única ordem. Executar a solução com foto, concluir e conferir Aguardando validação. Aprovar ou devolver e verificar a cadeia no histórico. Repetir o registro e a conclusão offline e sincronizar novamente. Validar também a importação dos relatórios de ensaio já existentes. Não integrar à main nesta etapa.

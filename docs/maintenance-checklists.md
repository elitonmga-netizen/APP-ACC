# Checklists de manutenção — homologação

Na OS, o técnico abre **Relatório técnico**, seleciona o tipo de equipamento, preenche a inspeção e salva o relatório. Administrador e Gestor consultam o checklist e baixam o PDF no fluxo existente de Relatórios → Relatório técnico.

Modelos disponíveis: Split, VRF, Ventilador, Exaustor, Climatizador e Fancoil. O modelo é escolhido por atendimento, sem alterar os cadastros existentes. Fancoil inclui o circuito de água gelada; componentes inexistentes podem ser marcados como Não se aplica.

Cada item aceita Pendente, Conforme, Não conforme ou Não se aplica, com observação de até 1.000 caracteres. Os itens começam pendentes: salvar não transforma itens não inspecionados em conformes. O resumo e o PDF mostram a quantidade de pendências e não conformidades. Trocar ou remover um modelo pede confirmação porque substitui suas respostas.

Medições são opcionais, com unidade indicada: tensão (V), corrente (A), retorno e insuflamento do ar (°C, nos modelos de climatização) e entrada/saída de água (°C, no fancoil). Campo vazio significa Não medido; zero é preservado. Limites amplos rejeitam entradas inválidas e não são critérios de aprovação técnica nem substituem especificações do fabricante.

Use **Salvar relatório** para gravar as respostas. Para salvar sem rede, prepare antes as OS no modo offline existente. O checklist integra o mesmo rascunho, operação idempotente, controle de conflito e autorização por técnico das fotos e do relatório. Reabrir o aplicativo conserva os rascunhos salvos; o PDF usa somente os dados já sincronizados no servidor.

Relatórios antigos continuam válidos sem checklist. Clientes antigos que omitem o campo ao atualizar o texto preservam o checklist existente. Enviar `checklist: null` remove-o explicitamente. Não há migração destrutiva: os dados ficam no JSON de relatório já utilizado pelo banco e pelos backups.

## Validação

Testes cobrem os seis modelos, status, chaves permitidas, limites, rejeição de medições em texto ou não finitas, autorização existente, API, rascunho após reabertura, sincronização idempotente e PDF com notas extensas e temperaturas da água. Para aceite em campo: criar uma OS de cada tipo, salvar conectado e offline, sincronizar e conferir o PDF como administrador. Não integrar à main nesta etapa.

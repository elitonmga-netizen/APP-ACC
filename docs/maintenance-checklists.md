# Checklists de manutenção — homologação

Na OS, o técnico abre **Relatório técnico**, seleciona o tipo de equipamento, preenche a inspeção e salva o relatório. Administrador e Gestor consultam o checklist e baixam o PDF no fluxo existente de Relatórios → Relatório técnico.

Modelos disponíveis: Split, VRF, Ventilador, Exaustor, Climatizador e Fancoil. O modelo é escolhido por atendimento, sem alterar os cadastros existentes. Fancoil inclui o circuito de água gelada; componentes inexistentes podem ser marcados como Não se aplica.

Cada item aceita Pendente, Conforme, Não conforme ou Não se aplica, com observação de até 1.000 caracteres. Os itens começam pendentes: salvar não transforma itens não inspecionados em conformes. O resumo e o PDF mostram a quantidade de pendências e não conformidades. Trocar ou remover um modelo pede confirmação porque substitui suas respostas.

Medições são opcionais, com unidade indicada: tensão (V), corrente (A), retorno e insuflamento do ar (°C, nos modelos de climatização) e entrada/saída de água (°C, no fancoil). Campo vazio significa Não medido; zero é preservado. Limites amplos rejeitam entradas inválidas e não são critérios de aprovação técnica nem substituem especificações do fabricante.

Use **Salvar relatório** para gravar as respostas. Para salvar sem rede, prepare antes as OS no modo offline existente. O checklist integra o mesmo rascunho, operação idempotente, controle de conflito e autorização por técnico das fotos e do relatório. Reabrir o aplicativo conserva os rascunhos salvos; o PDF usa somente os dados já sincronizados no servidor.

Relatórios antigos continuam válidos sem checklist. Clientes antigos que omitem o campo ao atualizar o texto preservam o checklist existente. Enviar `checklist: null` remove-o explicitamente. Não há migração destrutiva: os dados ficam no JSON de relatório já utilizado pelo banco e pelos backups.

## Validação

Testes cobrem os seis modelos, status, chaves permitidas, limites, rejeição de medições em texto ou não finitas, autorização existente, API, rascunho após reabertura, sincronização idempotente e PDF com notas extensas e temperaturas da água. Para aceite em campo: criar uma OS de cada tipo, salvar conectado e offline, sincronizar e conferir o PDF como administrador. Não integrar à main nesta etapa.

## Fotos por item e medições por componente

Cada ponto do checklist permite câmera ou galeria, prévia, legenda e remoção. As fotos são reduzidas no aparelho para JPEG de até 300 KB: até 2 por item e 24 no checklist. **Salvar relatório** grava de uma vez fotos, legendas, remoções e medições; escolher uma foto não substitui esse salvamento. O botão de salvar aguarda o preparo da imagem. As fotos gerais de antes/depois continuam separadas, com o limite anterior de 12.

Use **Adicionar componente** para cada compressor, motor do evaporador, motor do condensador, motor do ventilador, motor do exaustor, bomba de água ou outro componente. Informe uma identificação, por exemplo CP-01 ou EV-02. Até 20 componentes por relatório. Monofásico registra tensão de alimentação e corrente; trifásico registra tensões R–S, S–T, R–T e correntes R, S, T. Não medido e zero continuam distintos. Trocar a alimentação com medições preenchidas ou remover um componente pede confirmação.

Medições gerais antigas de tensão/corrente ficam visíveis como histórico, sem conversão automática para um componente. As temperaturas continuam disponíveis. No PDF, as fotos de cada item acompanham sua inspeção e os componentes têm identificação, alimentação, leituras por fase e observações próprias.

O conteúdo integra o relatório JSON existente, sem migração de banco, com as mesmas permissões de OS e auditoria. O limite do corpo do relatório é 11 MB e do envio offline é 21 MB, para acomodar a soma de evidências e fotos gerais. A preparação offline contabiliza também as fotos que estão dentro dos relatórios, preservando os limites locais de 30 MB na preparação e 45 MB com rascunhos. Rascunhos já salvos ficam preservados caso uma nova preparação exceda o limite.

Para aceite: testar compressor trifásico e motor monofásico na mesma OS; incluir fotos em dois itens; salvar e reabrir; repetir sem rede após preparar as OS; sincronizar e conferir item, legenda, identificação, fases e imagens no PDF. Remover uma foto no formulário e salvar não altera as fotos gerais.

# PDF do atendimento

No acesso de administrador ou gestor, abra **Relatórios**, escolha
**Relatório técnico** e clique em **Baixar PDF** na ordem desejada.
O botão também aparece ao visualizar o relatório. A exportação CSV continua
disponível para as listas.

O PDF contém cliente, local, equipamento, sistema, técnico responsável pelo
relatório, status, agendamento, datas de atualização e emissão, escopo,
diagnóstico, serviço executado, materiais, recomendações e fotos com etapa,
legenda e data de inclusão. Datas com horário usam America/Sao_Paulo.
O status da OS aparece mesmo quando o atendimento ainda não está concluído.

O técnico precisa ter preenchido e sincronizado o relatório antes da exportação.
Somente registros recebidos pelo servidor entram no documento. Conecte o
dispositivo e sincronize os rascunhos e fotos pendentes antes de gerar o PDF.
Sem fotos, o documento informa que nenhuma imagem foi anexada.

A rota autenticada `GET /api/service-orders/:id/report.pdf` retorna um arquivo
`application/pdf` como anexo, sem cache. Administradores e gestores podem
exportar. Técnicos e operadores recebem 403. Ordens sem relatório retornam 409,
ordens inexistentes retornam 404 e fotos corrompidas impedem a exportação com
uma mensagem de erro, para evitar um PDF que omita anexos silenciosamente.

Para validar: `pnpm lint`, `pnpm test` e `pnpm build`.
Os testes cobrem permissões, ausência de relatório, 12 imagens, paginação,
textos longos, fotos inválidas e nome seguro do arquivo.

# Atendimento offline — homologação

Disponível para Técnico vinculado. Requer Chrome com HTTPS/PWA e preparação explícita em aparelho de confiança. Não grava senhas ou tokens no IndexedDB; mantém identidade, dados atribuídos e rascunhos. A sessão HTTP continua em cookie HttpOnly.

## Validar no Samsung após publicar

1. Fechar o app e abrir conectado. Entrar como técnico.
2. Tocar em **Preparar este celular**. Esperar a confirmação (até 20 OS; 30 MB de fotos existentes; validade de 8 horas).
3. Ativar modo avião e desligar Wi-Fi. Fechar e reabrir o PWA.
4. Abrir uma OS preparada, iniciar, preencher diagnóstico/serviço, anexar fotos Antes/Depois e concluir.
5. Conferir o contador de pendências. Fechar/reabrir sem sinal e confirmar relatório, status e fotos locais.
6. Restabelecer internet. A sincronização começa em cerca de 2,5 segundos; também há **Sincronizar agora**.
7. Conferir zero pendências. Consultar a OS como administrador e verificar os registros.
8. Fazer logout apenas depois de sincronizar. Logout remove a preparação local e exige conexão para encerrar a sessão no servidor.

## Falhas previstas

- Sessão expirada: **Entrar novamente**, na mesma conta. Rascunhos permanecem.
- OS alterada/repassada por outra pessoa: o servidor rejeita o conflito. Rascunho permanece para revisão com o administrador; não há sobrescrita automática.
- Resposta perdida: o identificador e o conteúdo do envio ficam congelados até confirmação; nova tentativa não duplica fotos ou atualizações.
- Falta de espaço: não confirma salvamento que falhou.
- Sem conexão, só as OS previamente preparadas podem ser consultadas. Cadastros e demais ações administrativas continuam online.
- Uma preparação ocupa até 45 MB incluindo novos anexos. Não limpar dados do navegador nem desinstalar com rascunhos pendentes.

## Implantação

Aplicar à branch `feat/mobile-field-service`, baseada em `f662c9d`. Não alterar main. Fazer backup do banco da homologação antes de implantar. A migração 005 adiciona recibos idempotentes; backups preservam fotos e recibos e aceitam snapshots antigos das versões 3/4.

Validação automatizada: `pnpm lint`, `pnpm test` e build com `VITE_DATA_MODE=api`. Testes de IndexedDB usam um simulador de transações; o roteiro real no Samsung ainda precisa ser executado após o deploy.

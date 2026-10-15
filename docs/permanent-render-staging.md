# Homologação permanente mobile · preparação técnica

## Escopo e estado

Repositório: `elitonmga-netizen/APP-ACC`. O commit base confirmado é `5a7bdf95b24c60c4d0a3b3b9f6e3ff8370e35572`, publicado na branch `feat/mobile-field-service`. A main não foi alterada.

O serviço existente **app-acc**, seu disco e seu banco não devem ser modificados. `render.yaml` continua intacto. `render.staging.yaml` mantém a configuração temporária anterior; o novo arquivo é **render.permanent-staging.yaml**. Nenhum recurso pago deve ser criado antes da aprovação expressa do custo.

## Proposta para aprovação

| Recurso novo e independente | Configuração | Custo estimado mensal |
| --- | --- | --- |
| Serviço `app-acc-mobile-homologacao-permanente` | `0.5c-512mb`, 1 instância, Virginia | US$ 7,00 |
| Disco `app-acc-mobile-homologacao-dados` | 1 GB, exclusivo, `/var/acc-mobile-homologacao` | US$ 0,25 |
| Total base adicional | Sem alteração do plano ou serviço existente | **US$ 7,25** |

Valores consultados em 15/10/2026 em [Render Pricing](https://render.com/pricing). Impostos, câmbio, excedentes de tráfego/build e qualquer armazenamento externo de backup não estão incluídos. Não aprovar automaticamente custos extras, workspace pago, outro serviço ou aumento de disco. Confirmar no painel o preço antes de criar.

## Configuração revisada

- Branch exclusiva `feat/mobile-field-service`; deploy automático desligado e instância única, compatível com SQLite.
- Node.js 24.14.0, `NODE_ENV=production`, `VITE_DATA_MODE=api`, `VITE_API_URL` vazio: frontend e API na mesma origem HTTPS.
- Novo SQLite em `/var/acc-mobile-homologacao/acc.sqlite`, persistido no disco exclusivo. O entrypoint recusa caminhos de produção e só permite o arquivo principal ou uma recuperação versionada dentro de `restored/` nesse mesmo volume.
- Administrador inicial **admin-mobile@example.test**, com senha nova gerada pelo Render por `generateValue: true`. Não usa `STAGING_PASSWORD` nem contas/senhas temporárias. Copiar a nova senha pelo painel para um gerenciador de senhas; não gravá-la no Git nem em relatórios.
- Banco vazio recebe apenas o primeiro administrador, sem seed. Reinícios preservam registros, contas e senhas. Se houver registros sem contas, inicialização é bloqueada para investigação.
- HTTPS público e certificado do Render; origem permitida vem de `RENDER_EXTERNAL_URL`. Cookies Secure/HttpOnly/SameSite=Strict e as permissões atuais permanecem. Ao configurar domínio próprio, definir `CORS_ORIGIN` para a origem HTTPS exata.
- Não importar variáveis, chaves de email, discos ou dados do app-acc. Resend permanece sem configuração nesta homologação.
- PWA mantém manifesto, ícones 192/512, abertura `standalone` e cache somente da página pública offline. Dados da API continuam `no-store`.

## Publicação após autorização de custo

1. Conectar o Render e selecionar o workspace autorizado. Consultar apenas os recursos necessários; não editar o app-acc.
2. Criar **novo** Blueprint a partir da branch mobile, caminho `render.permanent-staging.yaml`. Conferir nome único, plano, disco, volume, variáveis e custo antes da confirmação.
3. Desligar Auto Sync do Blueprint e manter auto-deploy do serviço desativado, para publicação controlada. Não vincular o novo Blueprint ao serviço existente.
4. Aguardar lint, testes, build e health check. Conferir nos eventos do serviço que o disco exclusivo está montado. O disco só está disponível em runtime, não durante build/pre-deploy.
5. Validar a URL HTTPS efetivamente atribuída: `/`, `/api/health`, manifesto, service worker e ícones. Não presumir que um nome de serviço garante um endereço específico.
6. Entrar com o administrador novo; criar cadastros e técnico **fictícios** pela interface existente, provisionar uma conta técnica nova e criar uma OS fictícia. Não executar seed em produção nem importar o banco de produção.
7. Reiniciar apenas o serviço novo e verificar persistência da OS, usuários e relatório. Confirmar um backup válido no disco e exportar uma cópia para fora dele.
8. Só declarar publicação concluída após verificar a URL real, login, persistência após reinício e recuperação de uma cópia. A configuração no Git não prova a existência do serviço no Render.

## Backup implementado

`backend/backup.mjs` usa `node:sqlite.backup`, incluindo transações já confirmadas no WAL, sem copiar o arquivo ativo com `cp`. O entrypoint permanente cria um backup verificado antes de abrir o servidor e depois a cada 24 horas. Uma falha de backup inicial impede o startup; falhas periódicas são registradas como erro no log e precisam ser acompanhadas.

Cada snapshot contém o SQLite completo e um manifesto `.sqlite.json` com SHA-256, data, versão e contagens. São verificados `integrity_check`, `foreign_key_check` e tabelas essenciais. Arquivos têm permissões restritas. Os sete snapshots completos mais recentes são retidos; arquivos incompletos ou desconhecidos são preservados para investigação. O limite de sete é por quantidade, não por dias, pois cada reinício também gera um backup.

No Shell **do novo serviço**:

```sh
node backend/backup.mjs create
```

O comando exige `ACC_ENVIRONMENT=mobile-homologacao` e o `DATABASE_PATH` exclusivo. Não executar em app-acc. Monitorar diariamente logs e ocupação do volume. Planejar capacidade para banco, WAL e sete cópias; não aumentar o disco sem aprovação.

O snapshot SQLite inclui hashes de senhas e informações de sessão. Não disponibilizar arquivos por HTTP, não anexar ao Git nem compartilhar pelo chat. A exportação JSON do navegador não substitui este backup completo.

### Cópia externa e desastre do disco

Backups no mesmo volume protegem contra erros de aplicação, mas não contra perda total do volume/conta. Antes de considerar a rotina operacional completa, transferir **o par SQLite + manifesto** via SCP/SFTP do novo serviço para um destino privado aprovado, fora do Render, antes de cada deploy e ao menos diariamente durante os testes. Os parâmetros SSH/SCP devem ser copiados do painel do serviço novo; não usar os do app-acc.

Exemplo com placeholders (substituir pelos valores do painel, sem expor chaves):

```sh
scp -s <usuario>@<host-do-novo-servico>:/var/acc-mobile-homologacao/backups/<snapshot>.sqlite <diretorio-privado>/
scp -s <usuario>@<host-do-novo-servico>:/var/acc-mobile-homologacao/backups/<snapshot>.sqlite.json <diretorio-privado>/
```

Ainda depende da definição de destino externo e responsável; não há envio automático para terceiros nem contratação de storage adicional. A política proposta tem RPO de até 24 horas enquanto o serviço permanece ativo e o backup diário passa; o RPO externo depende da frequência da transferência. RTO deve ser medido em homologação após provisionar, sem promessa de tempo ainda.

## Recuperação sem substituir o banco ativo

1. Restringir os testes e avisar os usuários da homologação. Gerar um backup adicional antes da intervenção, quando o banco ainda estiver acessível.
2. Escolher o par snapshot/manifesto, local ou transferido por SFTP. No Shell do serviço novo, restaurar em **nome novo**:

```sh
node backend/backup.mjs restore /var/acc-mobile-homologacao/backups/<snapshot>.sqlite /var/acc-mobile-homologacao/restored/acc-restored-20261015.sqlite
```

3. A recuperação verifica checksum/integridade antes de copiar, recusa destino existente e mantém o arquivo ativo intocado. Revoga todas as sessões e tokens de recuperação **somente na cópia restaurada**, preservando contas, senhas, registros e auditoria.
4. Depois de validar a cópia, alterar **apenas no serviço novo** `DATABASE_PATH` para `/var/acc-mobile-homologacao/restored/acc-restored-20261015.sqlite` e fazer um deploy/restart controlado. O entrypoint aceita somente esse padrão dentro do volume da homologação. O SQLite anterior é preservado para retorno.
5. Fazer login novamente, validar OS/relatório/usuários/auditoria e criar novo snapshot. Se necessário, retornar a variável ao caminho anterior e reiniciar o serviço novo. Não restaurar snapshots de disco sobre uma base SQLite ativa.
6. Nunca usar `/var/data/acc.sqlite`, excluir bancos ou renomear arquivos de produção. Um rollback de código não restaura automaticamente os dados.

Referência: [Render Persistent Disks](https://render.com/docs/disks), que explica persistência, limitações de instância única, interrupção breve durante deploy e cuidados com recuperação de bancos em discos.

## Validação e aceite Android

Executar com Node 24.14+: `pnpm lint`, `pnpm test`, `pnpm build`. Os testes locais exercitam backup de um banco WAL aberto, igualdade de todos os registros recuperados, relatório técnico, auditoria, senha, revogação de sessões, rejeição de corrupção/sobrescrita, retenção e persistência em reinícios. Todos usam bancos temporários.

Após provisionar, abrir a **URL HTTPS permanente efetivamente validada** no Chrome do Samsung, menu ⋮ → Instalar e criar atalho → Instalar. Abrir pelo ícone ACC, conferir ausência de barra de endereço e entrar com a **conta técnica nova**. Desinstalar a versão do endereço temporário para evitar confusão. A nova instalação tem outra origem e não reutiliza sessão nem credenciais temporárias.

Verificar atendimento fictício completo, relatório salvo, fechamento/reabertura e persistência depois de reiniciar o serviço novo. Sem rede, aparece somente o aviso offline. Fotos, assinatura e PDF ficam para a próxima etapa.

## Pendências de publicação

São necessários aprovação de US$ 7,25/mês de custo base adicional, conexão do Render e definição de destino privado para cópias externas. Nenhum serviço pago foi criado nesta preparação. A URL permanente será registrada somente depois do deploy e validação reais; a URL temporária não é uma publicação permanente.

## Resultado desta preparação (15/10/2026)

- Commit base `5a7bdf9` confirmado e publicado na branch mobile.
- Lint, TypeScript, build de produção e suíte de **18 testes** aprovados. Após reforçar a verificação de retenção, lint e os três testes de backup/recuperação foram repetidos com sucesso.
- Backup/recuperação executados somente em diretórios temporários locais; nenhum banco real foi aberto por esses testes.
- `render.yaml` verificado sem alterações em relação ao commit base. A referência remota main observada antes da publicação final era `bd293870171bebcdb97d8ec564938411d4d310df`.
- Sem criação de recursos Render, deploy permanente ou alteração do serviço app-acc. A verificação de persistência após restart no Render, a exportação externa e a instalação Samsung na URL estável aguardam o provisionamento aprovado.

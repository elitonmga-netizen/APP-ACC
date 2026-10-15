# Instalação Android · homologação mobile

O APP-ACC usa PWA: ícone ACC próprio e `display: standalone`, sem barra de endereço quando aberto pelo ícone instalado. O aplicativo ainda exige conexão para login e operações; não há coleta de fotos, assinatura, geração de PDF ou edição offline nesta etapa.

Para a publicação permanente com disco exclusivo, credenciais novas e backup SQLite, seguir [permanent-render-staging.md](permanent-render-staging.md). As instruções abaixo descrevem o ambiente temporário da primeira validação.

## Ambiente isolado

`render.yaml` e o serviço existente não foram modificados. O arquivo **`render.staging.yaml`** descreve um NOVO serviço, chamado `app-acc-mobile-homologacao`, vinculado exclusivamente à branch `feat/mobile-field-service`, com deploy automático desativado.

O plano gratuito usa banco **efêmero** em `/tmp/app-acc-mobile-staging/acc.sqlite`, sem disco de produção. Ao recriar a instância, os testes podem ser reiniciados com dados fictícios. Não use esse ambiente para dados reais ou validação de durabilidade. O HTTPS termina no provedor; frontend e API usam a mesma origem e cookies Secure/HttpOnly/SameSite=Strict.

O entrypoint `backend/staging.mjs` exige `ACC_STAGING=fictitious-only`, recusa qualquer outro caminho de banco e exige `STAGING_PASSWORD` de 12 a 256 caracteres no ambiente. Ele provisiona dados e contas fictícias somente quando necessário, preservando atendimentos durante reinícios da mesma instância. A senha não é armazenada no repositório. Se alterar a variável após criar as contas, as senhas existentes não serão substituídas.

Contas exclusivamente fictícias:

| Conta | Perfil |
| --- | --- |
| `tecnico@example.test` | Lucas, técnico `tec-01` |
| `tecnica@example.test` | Ana, técnica `tec-02` |
| `admin@example.test` | Administrador |

Todas usam a senha definida em `STAGING_PASSWORD`. Não configure Resend nem credenciais de produção neste serviço.

## HTTPS temporário, sem publicar código

Para uma sessão de teste, o build de produção pode ser servido localmente pelo entrypoint de homologação na porta 3002, com Cloudflare Quick Tunnel apontando **somente** para `http://127.0.0.1:3002`. O túnel fornece uma URL `https://….trycloudflare.com` com certificado público válido; configure `CORS_ORIGIN` e `APP_PUBLIC_URL` com essa URL antes de iniciar o servidor. O banco deve continuar no caminho temporário exigido pelo entrypoint. `NODE_ENV=production` ativa o registro do PWA no build e cookies Secure no servidor.

É necessário compilar com `VITE_DATA_MODE=api` e `VITE_API_URL` vazio, mantendo API e frontend na mesma origem HTTPS. Nunca exponha o Vite de desenvolvimento ou a API existente pelo túnel. Não desative verificação de certificados no celular.

A URL temporária muda quando o túnel é recriado. Notebook, servidor e túnel devem permanecer ligados. Se instalar a partir dela, a instalação só alcançará o servidor enquanto essa URL estiver disponível. Para uso contínuo, instale novamente a partir da URL estável da homologação no Render.

## Homologação estável no Render

1. Disponibilizar a branch mobile no remoto requer autorização de push; o commit local sozinho não fica acessível ao Render. Não integrar à main.
2. Criar um **novo Blueprint**, escolhendo a branch mobile e o caminho `render.staging.yaml`. Não sincronizar esse arquivo com o serviço de produção.
3. Informar uma senha exclusiva em `STAGING_PASSWORD`. Não importar grupos de variáveis, discos, bancos ou segredos de produção.
4. Confirmar o plano gratuito e iniciar o deploy. O build executa lint, testes e compilação antes de iniciar a aplicação.
5. Usar a URL HTTPS exibida pelo provedor. O servidor usa `RENDER_EXTERNAL_URL` para a origem permitida. Não inserir `localhost` em `VITE_API_URL` na hospedagem.
6. Conferir `/api/health`, `/manifest.webmanifest`, `/sw.js` e os ícones antes de instalar. Se mudar a URL pública, ajustar a origem permitida ao mesmo endereço.

O ambiente Render só está publicado após existir um deploy concluído e uma URL verificada. A presença do YAML não significa que o serviço já foi criado.

## Instalar no Samsung pelo Chrome

1. No Samsung, abrir o **Chrome**, fora do modo anônimo.
2. Abrir a URL **HTTPS da homologação**. `localhost:5173` no celular aponta para o próprio celular e não serve para esta instalação.
3. Aguardar a página carregar. No menu **⋮**, procurar **Instalar e criar atalho → Instalar**, **Instalar aplicativo** ou **Adicionar à tela inicial**, conforme a versão do Chrome.
4. Confirmar a instalação e abrir pelo ícone **ACC** na tela inicial ou na lista de aplicativos.
5. Confirmar a abertura sem barra de endereço e entrar com `tecnico@example.test` e a senha de homologação.
6. Iniciar uma OS fictícia agendada, salvar o relatório, concluir, fechar e reabrir o aplicativo para verificar o registro no servidor.
7. Sem conexão, verificar a página informativa. Nenhuma ordem ou relatório deve aparecer como disponível offline.

Se houver apenas um atalho abrindo uma aba comum, aguardar e tentar novamente após atualizar o Chrome e conferir o certificado HTTPS, o manifesto e o service worker. A instalação real depende do Chrome/Android e deve ser confirmada no Samsung.

## PWA e cache

- Manifesto: `id`, `start_url` e `scope` em `/`, nome ACC, `display: standalone`, cores e ícones PNG 192/512; o ícone 512 também é maskable.
- Registro do service worker somente no build de produção, inclusive quando o módulo é carregado depois do evento `load`.
- Cache Storage persiste exclusivamente `/offline.html`, página pública baixada sem credenciais. API, formulários, ordens, relatórios, sessões e links de recuperação não são persistidos pelo service worker.
- API usa `Cache-Control: no-store` e o cliente pede `cache: no-store`. Service worker e manifesto usam revalidação HTTP.
- HTTPS externo deve ser validado após provisionar o ambiente. Instalação em aparelho real continua sendo o critério de aceite final.

## Seed corrigido

`db:seed` exige `DATABASE_PATH` explícito, recusa `NODE_ENV=production` e bloqueia bancos com registros. A gravação usa savepoints dentro da transação do seed; falhas revertem toda a carga. O provisionamento de homologação usa a mesma função de carga, mas somente após validar o caminho temporário exclusivo.

Testes: `pnpm lint`, `pnpm test` e `pnpm build`, com Node.js 24.14+. A suíte cobre seed/rollback, permissões, relatórios, manifesto, PNGs, MIME HTTP, cache, fallback offline e registro do service worker.

Em 15/10/2026, o build de homologação foi verificado por HTTPS público: página inicial, health check, manifesto, service worker, fallback offline e os dois ícones responderam HTTP 200 com certificado validado. Também foram confirmados API na mesma origem, login técnico fictício, cookie Secure/HttpOnly, escopo das ordens e logout. A instalação e a abertura pelo ícone ainda devem ser confirmadas no Samsung; a validação HTTP não substitui esse teste.

Referências: [Google Chrome no Android](https://support.google.com/chrome/answer/9658361?hl=pt-BR&co=GENIE.Platform%3DAndroid), [Render Blueprints](https://render.com/docs/blueprint-spec), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

# Mobile · etapa 1

Branch de desenvolvimento: `feat/mobile-field-service`. Nenhuma migração ou alteração de schema foi necessária.

## Arquitetura

O frontend React 18/TypeScript é compilado pelo Vite 5. A navegação existente usa estado React e histórico do navegador. O backend HTTP nativo Node.js 24.14+ serve o build e a API autenticada, com SQLite e controle de acesso no servidor.

Até 760 px, há navegação inferior (Início, Ordens, Relatórios, Ajustes e Mais). Mais mantém os módulos do menu existente, filtrados pelo perfil. No celular, técnicos autenticados entram diretamente nas ordens atribuídas, em cartões de atendimento. Acima desse limite, a tela original de ordens permanece em uso. O modo demonstrativo mantém sua navegação e dados existentes, sem simular uma conta técnica autenticada.

Os cartões mostram cliente, local/endereço, equipamento, agendamento, prioridade, descrição e status. Há busca, filtro e atualização manual. Iniciar e concluir reutilizam o PATCH da OS; a API continua validando titularidade e sequência Agendada → Em andamento → Concluída. A conclusão pede confirmação. Os relatórios técnicos são preenchidos no próprio atendimento pelo endpoint existente e continuam disponíveis em Relatórios. Não foi criada uma nova obrigação de relatório para concluir uma OS.

Formulários têm controles adequados ao toque. Listas de cadastros viram cartões com rótulos no celular, mantendo a tabela desktop. As tabelas de relatórios ficam empilhadas e os modais respeitam a altura disponível.

## PWA e privacidade

O manifesto e ícones PNG 192/512 permitem instalação Android em ambiente HTTPS (localhost também permite testar service workers). O registro acontece somente no build de produção. O navegador determina quando oferecer instalação; também é possível usar o menu de instalação do Chrome Android.

O service worker persiste **apenas `/offline.html`**, uma página pública sem dados de sessão, baixada sem credenciais. Não persiste o HTML do aplicativo, assets, respostas da API, URLs de recuperação, formulários, relatórios ou ordens. Navegações usam a rede e, em falha de conexão, exibem a página pública. API, mutações e outras origens não são interceptadas. O cache HTTP da API permanece `no-store`, também solicitado pelo cliente. Manifesto e service worker usam revalidação HTTP para permitir atualizações.

Não há edição offline, fila de envio ou sincronização em segundo plano. Campos não enviados ficam apenas na memória da tela e podem ser perdidos ao fechá-la. O sucesso só aparece após confirmação do servidor. O usuário precisa estar conectado para autenticar e trabalhar.

## Validação

- `pnpm lint`
- `pnpm build` (TypeScript + Vite)
- `pnpm test` (integração da API e testes do service worker executado em sandbox VM)

Os testes cobrem autenticação, persistência, escopo por técnico, transições, relatórios vinculados, isolamento de cache, fallback offline, ícones e cabeçalhos HTTP do PWA. O diretório local `.pnpm-store` é ignorado pelo lint por conter dependências.

Na primeira execução, lint, TypeScript, build Vite e os 8 testes passaram. Como o Node não estava no PATH, foram usados os executáveis locais com os mesmos entrypoints dos scripts de `package.json`. A validação visual automatizada foi interrompida pela ferramenta; posteriormente, o usuário confirmou a validação manual mobile com sucesso.

A preparação da instalação Android, o ambiente HTTPS isolado e a correção transacional do seed estão documentados em [android-installation.md](android-installation.md).

Antes da publicação, validar em Android real: instalação via HTTPS, login de técnico, busca e abertura da própria OS, iniciar, preencher relatório, concluir, voltar/avançar, reabrir instalado e abrir sem rede. Conferir teclados e modais a 320/360/390 px e comparar o desktop a 1280/1440 px. Validar com duas contas técnicas e perfis de leitura. Não houve publicação ou merge na main.

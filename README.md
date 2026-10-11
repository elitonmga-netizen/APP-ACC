# APP-ACC · Gestão Operacional para Climatização

Dashboard operacional da **ACC Climatização**, criado para centralizar a visão de ordens de serviço, manutenção preventiva, equipamentos e operação de campo.

## Sprint 1 — Fundação V1.0

Esta entrega estabelece a experiência visual e a base técnica do produto, sem backend ou banco de dados.

- React + Vite + TypeScript
- Dashboard responsivo para desktop, tablet e celular
- Navegação para Dashboard, Clientes, Locais, Equipamentos, Ordens de Serviço, Manutenção, Relatórios e Configurações
- Componentes reutilizáveis e dados demonstrativos isolados da interface
- ESLint e TypeScript em modo estrito

## Estrutura

```text
src/
├── components/       # Componentes reutilizáveis de UI e layout
├── data/             # Dados demonstrativos temporários
├── styles/           # Estilos globais e identidade visual
├── types/            # Contratos TypeScript
├── App.tsx           # Orquestração da experiência
└── main.tsx          # Ponto de entrada
```

## Como executar

Requer Node.js 20 ou superior.

```bash
pnpm install
pnpm dev
```

## Qualidade e build

```bash
pnpm lint
pnpm build
```

## Estado e próximos passos

A fundação de persistência/API/autenticação e as Sprints 4 e 5 estão implementadas. Relatórios permitem consultar ordens e preventivas, filtrar por status e exportar CSV. Configurações guarda a preferência de relatório neste dispositivo, mostra o perfil e o ambiente da sessão e exporta os cadastros carregados em JSON. A validação local cobre testes de integração, lint e build de produção.

O ambiente de teste está publicado no Render em `https://app-acc.onrender.com/`, com serviço e disco persistente. O domínio de envio do Resend ainda depende da configuração de DNS. Continue os testes com dados fictícios até validar rotinas de backup e recuperação.

### Preparação para publicação no Render

O `render.yaml` prepara um serviço único para frontend e API, HTTPS do subdomínio `onrender.com`, banco SQLite em disco persistente e checagem de saúde. O plano Starter e disco de 1 GB são pagos; confirme o preço final na criação do serviço. No primeiro provisionamento, o Render solicita `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` como segredos. O primeiro start cria o administrador somente se o banco estiver vazio; depois que conseguir entrar, remova os três segredos do serviço. Cadastre a equipe em **Usuários**. A URL de recuperação usa o endereço do serviço; o envio permanece desativado até configurar `RESEND_API_KEY` e `EMAIL_FROM` com um domínio verificado.

O banco não é incluído no Git. Faça um teste de cadastro, saída/entrada e reinício do serviço usando apenas dados fictícios antes de convidar a equipe.

## Sprint 3 — Persistência, API e autenticação

Requer **Node.js 24.14+**. O frontend continua em React/TypeScript. O backend modular usa JavaScript ESM e módulos nativos do Node (HTTP, SQLite, crypto e testes), sem dependências adicionais. Essa escolha permite executar a fundação local com o runtime já disponível. O SQLite em disco é adequado a esta etapa com uma instância da API; a operação síncrona e a maturidade de node:sqlite devem ser reavaliadas antes de escalar produção. A migração SQL versionada em `backend/migrations/001.sql` é executada automaticamente, em transação.

Os registros operacionais têm payloads JSON validados por schema, separados por recurso no SQLite. Referências são verificadas pela camada de persistência: não é permitido excluir registros vinculados nem trocar vínculos que invalidem cadastros dependentes. Usuários e sessões possuem tabelas próprias, com restrições e chave estrangeira. Uma próxima migração pode normalizar cada entidade em tabelas próprias.

### Desenvolvimento local

1. `pnpm install`
2. Copie `.env.example` para `.env`. Para dados persistentes, configure `VITE_DATA_MODE=api`.
3. Crie o primeiro administrador com variáveis temporárias no PowerShell:

```powershell
$env:ADMIN_EMAIL = 'admin@example.test'
$env:ADMIN_NAME = 'Administrador'
$secret = Read-Host 'Senha de pelo menos 12 caracteres' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
pnpm admin:create
Remove-Item Env:ADMIN_PASSWORD
```

4. Opcionalmente, `pnpm db:seed` insere somente os dados fictícios existentes, em banco vazio. Não use o seed com dados de clientes reais. O vínculo inconsistente da OS-1051 no mock anterior é corrigido somente no seed.
5. Em um terminal execute `pnpm dev:api`; em outro, `pnpm dev`.
6. Entre com o usuário criado. `VITE_DATA_MODE=demo` mantém o modo demonstrativo, com alterações apenas em memória. O modo API nunca retorna silenciosamente aos mocks quando houver erro.

O dashboard e as telas operacionais carregam a API após o login. Busca, filtros e paginação das listas consultam a API. Os formulários escolhem os vínculos explicitamente e mostram erros do servidor. Técnicos e sistemas podem ser provisionados pela API ou pelo seed nesta etapa.

### Contrato da API

Todos os recursos exigem sessão: `/api/clients`, `/api/locations`, `/api/equipment`, `/api/service-orders`, `/api/maintenance`, `/api/technicians` e `/api/climate-systems`.

- `GET /api/<recurso>` retorna uma lista; `GET /api/<recurso>/<id>` retorna um registro.
- `POST /api/<recurso>` cria e gera UUID no servidor (não envie `id`).
- `PUT /api/<recurso>/<id>` substitui campos; `PATCH` atualiza parcialmente, preservando o ID.
- `DELETE /api/<recurso>/<id>` exclui se não houver referências.
- `POST /api/auth/login` recebe `{ email, password }`; `GET /api/auth/me` retorna o usuário; `POST /api/auth/logout` revoga a sessão.
- `POST /api/auth/forgot-password` recebe `{ email }` e envia um link de uso único, válido por 30 minutos, quando a conta está ativa. A resposta é genérica para evitar revelar quais emails têm conta.
- `POST /api/auth/reset-password` recebe `{ token, password }`; a senha precisa ter de 12 a 256 caracteres. O uso do link revoga as sessões atuais da conta.
- `POST /api/users` cria usuários com `{ email, name, password, role }`, disponível somente para Administrador. Para o perfil `Técnico`, inclua `technicianId` de uma ficha existente.
- `GET /api/users` lista contas sem expor hashes; `PATCH /api/users/<id>` altera nome, perfil, vínculo técnico ou ativa/desativa contas.
- `POST /api/users/<id>/password` redefine a senha por ação administrativa e encerra as sessões da conta.
- `GET /api/audit?page=1&limit=20` consulta o histórico paginado (somente Administrador).
- Adicione `page`, `limit`, `q` e `status` a qualquer lista para receber `{ items, total, page, limit, totalPages }`. Limite: 100 registros por página.
- `GET /api/health` é público.

Requisições com corpo usam `Content-Type: application/json`. Toda mutação exige `X-ACC-Request: 1`. O navegador deve usar `credentials: 'include'`.

Todos os perfis podem ler dentro do escopo permitido. Técnicos veem ordens e preventivas atribuídas à ficha vinculada e os cadastros relacionados; podem avançar a própria OS de Agendada para Em andamento e depois Concluída. Administrador e Gestor podem criar/editar cadastros. Somente Administrador pode excluir, gerir usuários, consultar a auditoria e redefinir senhas. Operadores possuem leitura nesta etapa.

Validação retorna 400; sessão ausente/expirada, 401; falta de permissão/origem inválida, 403; recurso ausente, 404; conflito/referências, 409; limite de login, 429. Erros internos não expõem stack ou dados de banco.

### Autenticação e ambiente

Senhas usam scrypt com salt aleatório, comparação em tempo constante e custo explícito. Tokens aleatórios de sessão têm somente o hash armazenado e expiram em oito horas. O cookie é HttpOnly e SameSite=Strict, com Secure em `NODE_ENV=production`. Login possui limite de tentativas por IP em memória. Origem é permitida somente por `CORS_ORIGIN`, sem wildcard, e mutações têm cabeçalho de proteção contra CSRF.

`PORT`, `HOST`, `DATABASE_PATH`, `CORS_ORIGIN` configuram o backend; `VITE_API_URL` e `VITE_DATA_MODE` configuram o frontend no build. A recuperação por email usa `RESEND_API_KEY`, `EMAIL_FROM` e `APP_PUBLIC_URL`. O arquivo `.env`, o banco e logs estão ignorados no Git. Não coloque credenciais em variáveis `VITE_*`, que são públicas.

#### Configurar envio de recuperação (Resend)

1. Crie uma conta no Resend e adicione um domínio de envio. No painel, publique os registros DNS SPF e DKIM solicitados e aguarde a verificação do domínio.
2. Crie uma API key de envio e restrinja-a ao domínio verificado, se essa opção estiver disponível. Mantenha a chave somente no backend; nunca a inclua no frontend nem a envie pelo chat.
3. Copie `.env.example` para `.env` e preencha, por exemplo:

```dotenv
RESEND_API_KEY=re_sua_chave
EMAIL_FROM=APP-ACC <no-reply@mail.seudominio.com.br>
APP_PUBLIC_URL=http://localhost:5173
```

O endereço em `EMAIL_FROM` deve usar o domínio verificado no Resend. Em produção, configure `APP_PUBLIC_URL` com a URL HTTPS pública do frontend, `NODE_ENV=production` e `CORS_ORIGIN` com a origem pública correta. Cadastre as mesmas variáveis como segredos/ambiente no serviço que hospeda a API. Reinicie o backend após alterar `.env`. A migração `003.sql` cria o armazenamento dos hashes dos tokens; ela é aplicada automaticamente ao abrir o banco.

### Validação

```bash
pnpm lint
pnpm build
pnpm test
```

O teste de integração inicia a API em porta temporária e verifica os recursos REST, persistência após reabrir o SQLite, validação, integridade dos vínculos, bloqueio de exclusão, login, sessão expirada, logout, CORS, proteção de mutações e permissões. Usa banco temporário e dados fictícios.

### Sprint 4 / limites desta entrega

As telas da Sprint 4 cobrem edição e exclusão de cadastros, telas de usuários, técnicos, sistemas e auditoria, paginação/filtro/busca de recursos na API, e escopo de leitura por ficha atribuída ao técnico. Técnicos vinculados podem iniciar e concluir apenas as ordens associadas à própria ficha. Administradores podem desativar contas e redefinir senha; o usuário também pode solicitar a recuperação por email quando o Resend estiver configurado. Redefinições revogam as sessões existentes. As migrações `002.sql` e `003.sql` acrescentam auditoria, estado de conta, vínculo técnico e tokens de recuperação, preservando os dados anteriores.

O envio de email só funciona depois de configurar o domínio e as variáveis do Resend. O ambiente de teste publicado usa HTTPS, frontend/API no mesmo site (cookies SameSite=Strict), armazenamento persistente e uma única instância. Antes de usar dados reais, valide backups e recuperação do SQLite e revise a capacidade. Para múltiplas instâncias, migrar persistência e limite de login para serviços compartilhados.

### Sprint 5 — Relatórios e configurações

Relatórios consultam ordens de serviço e manutenções preventivas carregadas na sessão, permitem filtro de status e exportação CSV compatível com planilhas. Configurações mostra a conta e o modo de armazenamento, permite escolher o relatório padrão neste dispositivo e baixar cópia JSON dos cadastros carregados. O backup é uma exportação manual pelo navegador; ele não substitui uma rotina de backup do disco persistente no servidor.

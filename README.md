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

## Próximas etapas

A arquitetura mantém UI, tipos e dados separados para receber autenticação, API, persistência e regras de negócio nas próximas sprints.

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

O dashboard e as telas operacionais carregam a API após o login. Busca, filtros, detalhes e paginação permanecem no frontend. Os formulários escolhem os vínculos explicitamente e mostram erros do servidor. Técnicos e sistemas podem ser provisionados pela API ou pelo seed nesta etapa.

### Contrato da API

Todos os recursos exigem sessão: `/api/clients`, `/api/locations`, `/api/equipment`, `/api/service-orders`, `/api/maintenance`, `/api/technicians` e `/api/climate-systems`.

- `GET /api/<recurso>` retorna uma lista; `GET /api/<recurso>/<id>` retorna um registro.
- `POST /api/<recurso>` cria e gera UUID no servidor (não envie `id`).
- `PUT /api/<recurso>/<id>` substitui campos; `PATCH` atualiza parcialmente, preservando o ID.
- `DELETE /api/<recurso>/<id>` exclui se não houver referências.
- `POST /api/auth/login` recebe `{ email, password }`; `GET /api/auth/me` retorna o usuário; `POST /api/auth/logout` revoga a sessão.
- `POST /api/users` cria usuários com `{ email, name, password, role }`, disponível somente para Administrador.
- `GET /api/health` é público.

Requisições com corpo usam `Content-Type: application/json`. Toda mutação exige `X-ACC-Request: 1`. O navegador deve usar `credentials: 'include'`.

Todos os perfis podem ler. Administrador e Gestor podem criar/editar cadastros. Somente Administrador pode excluir e criar usuários. Técnico e Operador possuem leitura nesta fundação; permissões de atendimento por técnico ficam para a Sprint 4.

Validação retorna 400; sessão ausente/expirada, 401; falta de permissão/origem inválida, 403; recurso ausente, 404; conflito/referências, 409; limite de login, 429. Erros internos não expõem stack ou dados de banco.

### Autenticação e ambiente

Senhas usam scrypt com salt aleatório, comparação em tempo constante e custo explícito. Tokens aleatórios de sessão têm somente o hash armazenado e expiram em oito horas. O cookie é HttpOnly e SameSite=Strict, com Secure em `NODE_ENV=production`. Login possui limite de tentativas por IP em memória. Origem é permitida somente por `CORS_ORIGIN`, sem wildcard, e mutações têm cabeçalho de proteção contra CSRF.

`PORT`, `HOST`, `DATABASE_PATH`, `CORS_ORIGIN` configuram o backend; `VITE_API_URL` e `VITE_DATA_MODE` configuram o frontend no build. O arquivo `.env`, o banco e logs estão ignorados no Git. Não coloque credenciais em variáveis `VITE_*`, que são públicas.

### Validação

```bash
pnpm lint
pnpm build
pnpm test
```

O teste de integração inicia a API em porta temporária e verifica os recursos REST, persistência após reabrir o SQLite, validação, integridade dos vínculos, bloqueio de exclusão, login, sessão expirada, logout, CORS, proteção de mutações e permissões. Usa banco temporário e dados fictícios.

### Sprint 4 / limites desta entrega

Adicionar edição/exclusão na interface, telas administrativas de usuários/técnicos/sistemas, paginação no servidor, auditoria, escopo de atendimento por técnico e recuperação de senha. Implantação exige HTTPS, frontend/API no mesmo site (cookies SameSite=Strict), backups do SQLite, armazenamento persistente e revisão de capacidade. Para múltiplas instâncias, migrar persistência e limite de login para serviços compartilhados. Deploy e credenciais de produção não foram configurados nesta entrega.

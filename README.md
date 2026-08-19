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

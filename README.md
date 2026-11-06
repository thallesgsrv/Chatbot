# iEscolar Bot

Chatbot de suporte para WhatsApp com painel administrativo em tempo real (Electron).
O bot faz a triagem do usuário (CPF/matrícula → escola), mostra menus de ajuda com vídeos,
organiza a fila de espera e encaminha os problemas não resolvidos para um atendente humano,
que acompanha tudo pelo painel.

## Requisitos

- Node.js 20 ou superior
- PostgreSQL 13+
- Google Chrome instalado (usado pelo WhatsApp Web via `hydra-bot`)

## Como rodar

```bash
npm install
cp .env.example .env        # preencha DB_PASS e demais dados do PostgreSQL
npm start                   # abre o app Electron
```

As tabelas são criadas automaticamente na primeira execução (`sequelize.sync()`; nunca altera tabelas existentes).

| Comando | O que faz |
| --- | --- |
| `npm start` | Abre o app (Electron + bot + painel) |
| `npm run dev` | Igual, reiniciando ao salvar arquivos |
| `npm run serve` | Só backend + painel, sem Electron: abra a URL exibida no navegador. Com `BOT_ENABLED=false` não abre o WhatsApp |
| `npm run import:csv -- arquivo.csv` | Importa usuários/escolas de um CSV |
| `npm test` | Roda os testes (precisa de um PostgreSQL; veja abaixo) |
| `npm run dist` | Gera o instalador Windows |

### Configuração (`.env`)

Veja [`.env.example`](.env.example). Obrigatório: `DB_PASS`. O arquivo é procurado na pasta atual, na raiz do
projeto e, no app instalado, em `%APPDATA%\iEscolar Bot\.env`.

> O painel só aceita conexões da própria máquina (`127.0.0.1`). Defina `SERVER_HOST=0.0.0.0` apenas se
> realmente quiser expô-lo na rede: ele não tem autenticação.

## Estrutura

```
src/
├── main/        Processo principal do Electron (janela, IPC, preload)
├── backend.js   Raiz de composição: liga banco, serviços, bot e servidor
├── config/      Variáveis de ambiente -> objeto de configuração
├── database/    Conexão, models e associações (schema idêntico ao anterior)
├── services/    Regras de negócio e consultas (sem WhatsApp, sem HTTP)
├── bot/         Tudo que fala com o usuário no WhatsApp
│   ├── whatsapp-gateway.js   ÚNICO arquivo que conhece o hydra-bot
│   ├── message-router.js     Decide quem trata cada mensagem
│   ├── conversation-store.js Em que passo cada conversa está
│   ├── attendance-coordinator.js  Concluir / promover fila / atendente assume
│   ├── flows/                Triagem, menu de problemas, avaliação
│   └── messages/             Textos do bot (.json) e catálogo de problemas
├── server/      Express + Socket.IO (rotas REST finas, delegam aos serviços)
├── shared/      Contrato e formatação usados pelo servidor E pela interface
└── renderer/    Interface (módulos ES; sem CDN, funciona offline)
    ├── shared/  api, realtime, sidebar, tema, dom (escape de HTML)
    └── pages/   overview, cards, dashboard, completed, contacts
test/            Testes de integração e unitários
scripts/         serve.js, import-users-csv.js
```

### Como uma mensagem é tratada

```
WhatsApp ─► WhatsAppGateway ─► MessageRouter ─► (Step da conversa) ─► Flow
                                                                        │
              Painel ◄── Realtime (Socket.IO) ◄── Services (banco) ◄────┘
```

O estado de cada conversa é um único `Step` (`PRIVACY → IDENTIFIER → … → MAIN_MENU → … → HUMAN → RATING`)
em `conversation-store.js`. Para alterar o que o bot diz, edite os `.json` em `src/bot/messages/`;
para mudar o menu de problemas, edite `problem-catalog.json` (número, rótulo, opções e vídeos no mesmo lugar).

## Testes

```bash
# banco só para testes (os testes recusam rodar em bancos sem "test" no nome)
createdb chatbot_test
TEST_DB_PASS=sua_senha npm test
```

Variáveis opcionais: `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_NAME`.
Os testes sobem o backend completo e conversam com o bot por um gateway falso.

Mais detalhes sobre o que mudou nesta refatoração: [docs/REFATORACAO.md](docs/REFATORACAO.md).

## Licença

MIT

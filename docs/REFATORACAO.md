# Refatoração: o que mudou e o que revisar

Este documento lista **todas as mudanças de comportamento** (não só de organização) e o que **não foi
possível verificar**. O schema do banco é idêntico ao anterior (comparado com `pg_dump`), então bancos
existentes continuam funcionando sem migração.

## 1. Problemas estruturais resolvidos

| Antes | Agora |
| --- | --- |
| `bot.js` com 862 linhas (Express, Socket.IO, roteamento, SQL, fila, envio) | `bot/`, `server/` e `services/` separados; nenhum arquivo passa de ~200 linhas |
| `Screening` ⇄ `ProblemManager` se referenciando; 2 mapas de "tópico" + `sharedState` + Set de humanos | Um `ConversationStore` com um `Step` por chat |
| Models como singletons importados de qualquer lugar | `createDatabase()` + injeção; associações num único arquivo |
| "último createcall do chat → call" repetido ~8× | `CallService.findLatestByChatId` (1 consulta) |
| 4 queries quase iguais para montar o painel | `StatusService.getSnapshot` (2 queries) |
| 5 `count` para as avaliações | 1 consulta agrupada |
| URL `http://localhost:3000` e nomes de eventos como strings espalhadas | Mesma origem + `shared/protocol.js` |
| 3 cópias divergentes de formatação de nomes | `shared/format.js` |
| Botões com `onclick` inline, `renderer.js` carregado em todas as páginas | Módulos ES por página, `addEventListener` |

**Removido (código morto):** 6 arquivos vazios, `serviceFeedback.js` (tudo comentado, SQLite legado),
`socketmanager.js` (duplicado e quebrado), model `request` (nunca carregado), `awaitingCitySelection`
(estado que nunca era definido), `statusMap.json`, `logs.json`, script `start-bot` (quebrado),
handlers IPC sem uso, `extraResources` duplicado no build.
**Dependências removidas:** `sqlite3`, `qrcode`, `open`, `puppeteer-core`, `date-fns`, `socket.io-client`
(este último virou só devDependency, para os testes).

## 2. Bugs corrigidos (comportamento que muda)

1. **`/recuperar` foi removido.** Chamava `getDatabase()` (não existe mais) e, se funcionasse, enviaria
   **senha em texto puro** por WhatsApp. A tabela `confidencial` não é tocada.
2. **Mensagens que eram enviadas como `undefined`** (chaves inexistentes): CPF inválido, nenhuma escola
   encontrada, vídeo não ajudou, "problema registrado". Agora têm texto. **Revise o texto** de
   `invalidIdentifier`, `noSchoolsFound` (em `errors.json`) e `feedbackNegative` (em `dialogs.json`); fui eu quem os escreveu.
3. **CPF com traço** (`123.456.789-00`): a regex `[.-/]` não removia o `-`. Agora só dígitos.
4. **Quem está na fila e manda outra mensagem** recebia o menu e furava a fila. Agora recebe a posição atual.
5. **Fila promovia 2 pessoas por vaga** (ao encerrar e de novo ao avaliar). Agora promove **uma vez por
   conclusão**, também quando o vídeo resolve ou o chat é fechado no WhatsApp. Corrida entre "ver vaga" e
   "criar atendimento" protegida por mutex.
6. **`dateTimeFinish` nulo** quando o vídeo resolvia (a tela de concluídos quebrava com 500). Sempre gravado;
   avaliar não sobrescreve mais a data de término.
7. **Notificação de novo problema** nunca funcionou (`showNotification` não existia). Implementada.
   Cidade e escola vinham sempre vazias; agora preenchidas.
8. **Problema assumido** continuava aparecendo em "Problemas relatados". Agora sai (segue em "ativos").
9. **Descrições** eram salvas em minúsculas e re-capitalizadas na tela. Agora ficam como o usuário digitou.
10. **Relatório** excluía o último dia do período; filtros de data misturavam UTC e hora local. Agora dias
    inclusivos no fuso local. Gráfico mensal somava o mesmo mês de todos os anos (agora só o ano corrente);
    gráfico semanal mostrava a semana seguinte aos domingos; agrupamento por dia usa `DB_TIMEZONE`.
11. **`completed-attendances?client=`** respondia 500. Corrigido.
12. **Card:** o link digitado ia direto a um `href` (aceitava `javascript:`). Agora só http/https
    (assume `https://` se faltar). A resposta ao concluir/reabrir passou a incluir o telefone.
13. **Contatos:** ignorados que não aparecem mais no WhatsApp continuam listados (antes seriam apagados ao salvar
    sem aviso). Telefone com 9º dígito era formatado errado (`(83) 99960-80051`).
14. **Interface:** link ativo do menu nunca era destacado; `window.electron.openWhatsAppChat` não existia;
    `[object Object]` no filtro de atendentes; listeners de modal acumulavam; modal podia ficar preso
    aberto com clique rápido; gráficos ilegíveis no tema escuro.
15. Nomes padronizados: relatórios agora seguem a tela (`Maria da Silva`, não `Maria Da Silva`).

## 3. Segurança

- Credenciais do banco saíram do código (`.env`). **A senha antiga continua no histórico do git: troque-a.**
- Servidor escuta só em `127.0.0.1` (antes `0.0.0.0` + CORS `*`, sem autenticação); valida `Host`/`Origin`.
- CSP sem `unsafe-eval` e sem `https:`; nada de CDN; `sandbox` + `contextIsolation`; o preload expõe 2 métodos.
- Todo texto vindo do WhatsApp é escapado antes de ir ao DOM (antes: XSS por `innerHTML`).
- Uma única instância do app por vez.

## 4. Como foi verificado

- **29 testes + 1 de importação CSV** (PostgreSQL real): fluxo completo do bot, fila, atendente humano, API,
  relatórios PDF/XLSX, segurança. Um teste de mutação confirmou que os testes detectam a quebra da fila.
- **Schema** gerado pelos models novos comparado com o dos antigos: idêntico.
- **Equivalência:** rotas antigas vs. novas no mesmo banco: 12 respostas idênticas e 1 diferença (o bug do item 11).
- **Electron real** (Linux/Xvfb) dirigido por DevTools: 38 verificações em todas as páginas, sem erros de
  console/CSP/rede.

## 5. O que NÃO foi verificado (faça você)

- **WhatsApp de verdade.** Não há WhatsApp aqui. `whatsapp-gateway.js` reproduz exatamente as chamadas do
  `hydra-bot` do código original, mas só a normalização de mensagens/contatos tem teste. Teste uma conversa completa.
- **Build/instalador Windows** (`npm run dist`) e execução no Windows. `package.json` aponta para
  `assets/ico.ico`, que **não existe no repositório**. Removi o `extraFiles` de `puppeteer-core/.local-chromium`
  (essa pasta não existe nessa versão); se o instalador precisava dela, restaure.
- Para o app instalado, o `.env` deve ficar em `%APPDATA%\iEscolar Bot\.env`.

## 6. Pendências que mantive de propósito

- As **URLs dos vídeos** em `problem-catalog.json` são placeholders (`youtube.com/watch?v=acesso-conta`…): o bot as envia aos usuários.
- O estado das conversas fica **em memória**: reiniciar o app com alguém em atendimento ativo deixa o `call` como
  `ACTIVE` e ocupa a vaga da fila até ser concluído manualmente.
- Quem não responde a avaliação fica preso no passo de avaliação (não expira).
- Opção 5 (RFACE) conclui o atendimento sem descrição (some das estatísticas), como antes.
- O CSS (~4 mil linhas) foi só movido, não reescrito.

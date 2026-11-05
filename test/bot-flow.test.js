'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: ioClient } = require('socket.io-client');
const { setup, login } = require('./helpers');
const { CallStatus, SocketEvents } = require('../src/shared/protocol');
const { Step } = require('../src/bot/conversation-store');
const { greetings, errors, finished, dialogs, problemCatalog } = require('../src/bot/messages');

let ctx;
before(async () => { ctx = await setup(); });
after(async () => { await ctx.stop(); });

const chat = (n) => `558399000000${n}@c.us`;
const latestCall = async (chatId) => ctx.backend.services.calls.findLatestByChatId(chatId);

test('triagem: termos, CPF e abertura do atendimento (usuário com 1 escola)', async () => {
    const c = chat(1);
    await ctx.say(c, 'oi');
    assert.deepEqual(ctx.gateway.textsTo(c), [greetings.guidelines, greetings.aceptedguidelines]);

    await ctx.say(c, 'talvez');
    assert.equal(ctx.gateway.lastTo(c), greetings.guidelinesInvalid);

    await ctx.say(c, 'SIM');
    assert.ok(greetings.welcome.includes(ctx.gateway.lastTo(c)));

    await ctx.say(c, '123');
    assert.equal(ctx.gateway.lastTo(c), errors.invalidIdentifier);

    await ctx.say(c, '000.000.000-00');
    assert.equal(ctx.gateway.lastTo(c), errors.userNotFound);

    await ctx.say(c, '123.456.789-00'); // CPF formatado
    const texts = ctx.gateway.textsTo(c);
    assert.ok(texts.some((t) => t.includes('EMEF JOSE DE ALENCAR - CAMPINA GRANDE (PROFESSOR)')));
    assert.equal(texts.at(-1), dialogs.problemOptions);
    assert.equal(ctx.backend.bot.store.get(c).step, Step.MAIN_MENU);

    const call = await latestCall(c);
    assert.equal(call.status, CallStatus.ACTIVE);
    assert.equal(call.position, 'PROFESSOR');
});

test('rejeitar os termos encerra e a próxima mensagem recomeça', async () => {
    const c = chat(2);
    await ctx.say(c, 'oi');
    await ctx.say(c, 'não');
    assert.equal(ctx.gateway.lastTo(c), greetings.guidelinesRejected);
    assert.equal(ctx.backend.bot.store.get(c), undefined);
    await ctx.say(c, 'oi');
    assert.equal(ctx.gateway.lastTo(c), greetings.aceptedguidelines);
});

test('vários vínculos: escolhe tipo e depois a escola', async () => {
    // Carla tem 2 tipos; Bruno tem 2 escolas. Fila liberada antes (maxActive=1 já ocupado por outro teste)
    const { calls } = ctx.backend.services;
    const c = chat(3);
    await login(ctx, c, '111.222.333-44');
    assert.match(ctx.gateway.lastTo(c), /Você possui mais de um tipo de vínculo/);
    assert.match(ctx.gateway.lastTo(c), /1 - PROFESSOR\n2 - RESPONSAVEL/);

    await ctx.say(c, '9');
    assert.equal(ctx.gateway.lastTo(c), errors.invalidOption);
    await ctx.say(c, '2');
    // só 1 escola para RESPONSAVEL => abre direto (fila: chat 1 ocupa a vaga)
    assert.ok(ctx.gateway.textsTo(c).some((t) => t.includes('EE MARIA DA PENHA - CAMPINA GRANDE (RESPONSAVEL)')));
    assert.ok(await calls.findLatestByChatId(c));

    const d = chat(4);
    await login(ctx, d, '987.654.321-00');
    assert.match(ctx.gateway.lastTo(d), /Você possui vínculo em mais de uma escola/);
    assert.match(ctx.gateway.lastTo(d), /1 - EE MARIA DA PENHA\n2 - EMEF JOSE DE ALENCAR/); // ordenadas por nome
    await ctx.say(d, '0');
    assert.equal(ctx.gateway.lastTo(d), errors.invalidOption);
});

test('fila: com a vaga ocupada o usuário espera e é avisado se escrever', async () => {
    const c = chat(3);
    const call = await latestCall(c);
    assert.equal(call.status, CallStatus.WAITING);
    assert.ok(ctx.gateway.textsTo(c).some((t) => t === greetings.queueFirstNotification.replace('%d', 1)));
    assert.equal(ctx.backend.bot.store.get(c).step, Step.IN_QUEUE);

    // escrever na fila NÃO pula a fila (mostrava o menu no código antigo)
    await ctx.say(c, 'oi?');
    assert.equal(ctx.gateway.lastTo(c), greetings.queueUpdate.replace('%d', 1));
    assert.equal((await latestCall(c)).status, CallStatus.WAITING);
});

test('vídeo ajudou: conclui, promove UMA vez e aceita a avaliação', async () => {
    const c = chat(1);
    await ctx.say(c, '1'); // Acesso ao sistema
    assert.equal(ctx.gateway.lastTo(c), problemCatalog[0].title);
    await ctx.say(c, '9');
    assert.equal(ctx.gateway.lastTo(c), problemCatalog[0].title); // erro + reexibe submenu
    await ctx.say(c, '1');
    assert.ok(ctx.gateway.textsTo(c).some((t) => t.includes('youtube.com')));
    assert.equal(ctx.gateway.lastTo(c), dialogs.videoFeedback);
    assert.equal((await latestCall(c)).description, 'Acesso ao sistema - Recuperação de senha');

    await ctx.say(c, 'sim');
    const done = await latestCall(c);
    assert.equal(done.status, CallStatus.COMPLETED);
    assert.ok(done.dateTimeFinish, 'sempre grava a data de término');
    assert.equal(ctx.gateway.lastTo(c), finished.feedbackRequest);

    // o primeiro da fila (chat 3) foi promovido e recebeu o menu
    const next = chat(3);
    assert.equal((await latestCall(next)).status, CallStatus.ACTIVE);
    assert.ok(ctx.gateway.textsTo(next).some((t) => t.startsWith('Olá Carla Dias! Sua vez chegou')));
    assert.equal(ctx.gateway.lastTo(next), dialogs.problemOptions);

    const activeBefore = await ctx.backend.services.queue.countActive();
    await ctx.say(c, '7');
    assert.equal(ctx.gateway.lastTo(c), finished.feedbackInvalid);
    await ctx.say(c, '5');
    assert.equal((await latestCall(c)).rating, 5);
    assert.deepEqual(ctx.gateway.textsTo(c).slice(-2), [finished.feedbackThank, finished.chatCompleted]);
    assert.equal(await ctx.backend.services.queue.countActive(), activeBefore, 'avaliar não promove ninguém');
    assert.equal(ctx.backend.bot.store.get(c), undefined);
});

test('fluxo humano: descrever, notificar painel, atender, finalizar e avaliar', async () => {
    const c = chat(3); // já está no menu após ser promovido
    const socket = ioClient(ctx.url, { transports: ['websocket'] });
    const events = [];
    socket.on(SocketEvents.USER_PROBLEM, (p) => events.push(['problem', p]));
    socket.on(SocketEvents.STATUS_UPDATE, (s) => events.push(['status', s]));
    await new Promise((r) => socket.on('connect', r));
    try {
    await ctx.say(c, '6');
    assert.equal(ctx.gateway.lastTo(c), dialogs.describeIssue);
    await ctx.say(c, 'Meu Sistema Não ABRE desde ontem');
    await new Promise((r) => setTimeout(r, 100));

    const pending = await latestCall(c);
    assert.equal(pending.status, CallStatus.PENDING);
    assert.equal(pending.description, 'Meu Sistema Não ABRE desde ontem', 'mantém o texto original');
    assert.equal(ctx.gateway.lastTo(c), greetings.attendantAssigned);

    const problem = events.find(([k]) => k === 'problem')[1];
    assert.equal(problem.city, 'CAMPINA GRANDE', 'cidade agora vem preenchida');
    assert.equal(problem.school, 'EE MARIA DA PENHA');
    assert.equal(problem.name, 'CARLA DIAS');

    // humano assumiu: o bot fica em silêncio
    const before = ctx.gateway.textsTo(c).length;
    await ctx.say(c, 'alguém aí?');
    assert.equal(ctx.gateway.textsTo(c).length, before);

    const snapshot = await ctx.backend.services.status.getSnapshot();
    assert.equal(snapshot.problems.length, 1);

    await ctx.backend.bot.coordinator.attendProblem({ chatId: c, attendantName: 'Joana' });
    assert.match(ctx.gateway.lastTo(c), /Olá, eu sou Joana/);
    const afterAttend = await ctx.backend.services.status.getSnapshot();
    assert.equal(afterAttend.problems.length, 0, 'problema assumido sai de "Problemas reportados"');
    assert.equal(afterAttend.activeChats.length, 1, 'e segue em atendimento');

    await ctx.backend.bot.coordinator.endChat({ chatId: c });
    assert.equal(ctx.gateway.lastTo(c), finished.feedbackRequest);
    const done = await latestCall(c);
    assert.equal(done.status, CallStatus.COMPLETED);
    const finishedAt = done.dateTimeFinish.getTime();

    await ctx.say(c, '4');
    const rated = await latestCall(c);
    assert.equal(rated.rating, 4);
    assert.equal(rated.dateTimeFinish.getTime(), finishedAt, 'avaliar não altera a data de término');
    assert.equal(rated.attendant.name, 'Joana');

    // finalizar duas vezes é inofensivo
    await ctx.backend.bot.coordinator.endChat({ chatId: c });
    } finally {
        socket.close();
    }
});

test('contatos desabilitados, grupos e mensagens próprias são ignorados', async () => {
    const { seed, backend } = ctx;
    await backend.services.contacts.replaceDisabled([{ id: chat(8), description: 'interno' }]);
    await ctx.say(chat(8), 'oi');
    assert.equal(ctx.gateway.textsTo(chat(8)).length, 0);

    await ctx.say('12345-678@g.us', 'oi', { isGroup: true });
    await ctx.say(chat(9), 'oi', { fromMe: true });
    await ctx.say(chat(9), 'antiga', { timestampMs: Date.now() - 3600_000 });
    assert.equal(ctx.gateway.textsTo(chat(9)).length, 0);
    assert.ok(seed.attendant);

    // mesma mensagem (mesmo id) entregue duas vezes é processada uma só vez
    const sentBefore = ctx.gateway.textsTo(chat(7)).length;
    await ctx.say(chat(7), 'oi', { id: 'dup-1' });
    const afterFirst = ctx.gateway.textsTo(chat(7)).length;
    await ctx.say(chat(7), 'oi', { id: 'dup-1' });
    assert.equal(ctx.gateway.textsTo(chat(7)).length, afterFirst);
    assert.ok(afterFirst > sentBefore);
});

test('chat fechado no WhatsApp conclui o atendimento e libera o estado', async () => {
    const c = chat(5);
    await login(ctx, c, '555.666.777-88'); // Dora: vaga livre agora
    assert.equal((await latestCall(c)).status, CallStatus.ACTIVE);
    await ctx.backend.bot.coordinator.handleChatClosed(c);
    assert.equal((await latestCall(c)).status, CallStatus.COMPLETED);
    assert.equal(ctx.backend.bot.store.get(c), undefined);
});

test('opção 5 (RFACE) informa o contato e conclui sem descrição', async () => {
    const c = chat(6);
    await login(ctx, c, '999.000.111-22');
    await ctx.say(c, '5');
    assert.equal(ctx.gateway.lastTo(c), dialogs.rfaceContact);
    const call = await latestCall(c);
    assert.equal(call.status, CallStatus.COMPLETED);
    assert.equal(call.description, null);
});

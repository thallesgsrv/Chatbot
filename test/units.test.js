'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Format = require('../src/shared/format');
const Mutex = require('../src/services/mutex');
const Messenger = require('../src/bot/messenger');
const { normalizeLink } = require('../src/services/card-service');
const { parseLocalDate, dayRange, periodRange, toLocalDateKey } = require('../src/services/date-range');
const { workWeekOf } = require('../src/services/statistics-service');
const { toIncomingMessage, normalizeTimestamp, toContact } = require('../src/bot/whatsapp-gateway');
const { format } = require('../src/bot/messages');

test('Format: nomes, escolas, telefone e duração', () => {
    assert.equal(Format.formatName('MARIA DA SILVA  E SOUZA'), 'Maria da Silva e Souza');
    assert.equal(Format.formatSchoolName('emef josé de alencar'), 'EMEF José de Alencar');
    assert.equal(Format.formatPosition('SECRETARIO'), 'Secretário');
    assert.equal(Format.formatPosition(''), '');
    assert.equal(Format.formatPhone('5583996080051@c.us'), '(83) 99608-0051');
    assert.equal(Format.toChatId('5583996080051'), '5583996080051@c.us');
    assert.equal(Format.toChatId('x@g.us'), 'x@g.us');
    assert.equal(Format.formatDuration(0), 'N/A');
    assert.equal(Format.formatDuration(125), '2h5min');
    assert.equal(Format.formatDuration(1625, { verbose: true }), '1d 3h 5min');
});

test('format() das mensagens substitui %s e %d em ordem', () => {
    assert.equal(format('Olá %s, posição %d', 'Ana', 3), 'Olá Ana, posição 3');
    assert.equal(format('sem valores %s'), 'sem valores %s');
});

test('date-range: dia local, período inclusivo e validações', () => {
    const { start, end } = dayRange('2025-03-10');
    assert.equal(start.getHours(), 0);
    assert.equal(end.getHours(), 23);
    assert.equal(toLocalDateKey(start), '2025-03-10');
    assert.throws(() => parseLocalDate('2025-02-30'), /inexistente/);
    assert.throws(() => parseLocalDate('10/03/2025'), /inválida/);
    assert.throws(() => periodRange('2025-03-11', '2025-03-10'), /posterior/);
    const p = periodRange('2025-03-01', '2025-03-31');
    assert.equal(toLocalDateKey(p.end), '2025-03-31');
});

test('semana útil: segunda a sexta, e domingo mostra a semana que acabou', () => {
    const keys = (d) => workWeekOf(d).map(toLocalDateKey);
    assert.deepEqual(keys(new Date(2025, 0, 8)), ['2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09', '2025-01-10']); // quarta
    assert.equal(keys(new Date(2025, 0, 12))[0], '2025-01-06'); // domingo (o código antigo mostrava a semana seguinte)
    assert.equal(keys(new Date(2025, 0, 13))[0], '2025-01-13'); // segunda
});

test('normalizeLink: assume https e rejeita esquemas perigosos', () => {
    assert.equal(normalizeLink('trello.com/c/x'), 'https://trello.com/c/x');
    assert.equal(normalizeLink(' http://a.com/x '), 'http://a.com/x');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '', '   ']) {
        assert.throws(() => normalizeLink(bad), bad);
    }
});

test('Mutex executa em série mesmo com falhas', async () => {
    const mutex = new Mutex();
    const order = [];
    const slow = mutex.run(async () => { await new Promise((r) => setTimeout(r, 30)); order.push('a'); });
    const failing = mutex.run(async () => { order.push('b'); throw new Error('x'); });
    const last = mutex.run(async () => { order.push('c'); return 42; });
    await assert.rejects(failing);
    assert.equal(await last, 42);
    await slow;
    assert.deepEqual(order, ['a', 'b', 'c']);
});

test('Messenger: ordem por chat, dedupe, vazio e falha sem lançar', async () => {
    const sent = [];
    let fail = false;
    const gateway = { sendText: async (chatId, body) => { if (fail) throw new Error('offline'); sent.push([chatId, body]); } };
    const waits = [];
    const m = new Messenger({ gateway, dedupeWindowMs: 50, sleep: async (ms) => waits.push(ms) });

    await Promise.all([m.send('a', '1'), m.send('a', '2', { delay: 500 }), m.send('b', 'x')]);
    assert.deepEqual(sent.filter(([c]) => c === 'a').map(([, t]) => t), ['1', '2']);
    assert.deepEqual(waits, [500]);

    assert.equal(await m.send('a', '2'), false, 'repetida na janela é descartada');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(await m.send('a', '2'), true, 'depois da janela volta a enviar');
    assert.equal(await m.send('a', undefined), false);
    fail = true;
    assert.equal(await m.send('a', 'novo'), false);
    await m.idle();
});

test('gateway: normaliza mensagens, timestamps e contatos', () => {
    assert.equal(normalizeTimestamp({ messageTimestamp: 1700000000 }), 1700000000000);
    assert.equal(normalizeTimestamp({ timestamp: 1700000000000 }), 1700000000000);
    assert.equal(normalizeTimestamp({ id: 'false_x_1700000000123@c.us' }), 1700000000123);

    const msg = toIncomingMessage({ result: { id: 'i', chatId: '1@g.us', body: 'oi', fromMe: false, messageTimestamp: 1700000000 } });
    assert.deepEqual([msg.isGroup, msg.body, msg.timestampMs], [true, 'oi', 1700000000000]);
    assert.equal(toIncomingMessage({ result: { chatId: '1@c.us' } }).body, '');

    assert.equal(toContact({ id: '1@g.us' }), null);
    assert.equal(toContact({ id: { _serialized: '55@c.us', user: '55' }, name: 'X', t: 1700000000000 }).lastMessageTime, 1700000000);
    assert.equal(toContact({ id: { user: '99' } }).id, '99@c.us');
});

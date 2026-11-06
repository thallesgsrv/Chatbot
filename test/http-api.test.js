'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setup } = require('./helpers');
const { CallStatus } = require('../src/shared/protocol');

let ctx;
let ids = {};
const get = (path, opts) => fetch(ctx.url + path, opts);
const json = async (path, opts) => (await get(path, opts)).json();
const send = (method, path, body) =>
    get(path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });

/** Cria um atendimento já concluído, em data/hora específicas (horário local). */
async function completedCall({ user, school, date, minutes = 30, rating, attendant, description = 'Problema X', position }) {
    const { CreateCall, Call } = ctx.backend.models;
    const cc = await CreateCall.create({ userId: user.id, schoolId: school.id, chatId: `55${user.id}@c.us`, date });
    return Call.create({
        createCallId: cc.id, position: position || user.type, status: CallStatus.COMPLETED, description,
        dateTimeFinish: new Date(date.getTime() + minutes * 60000), rating, attendantId: attendant ? attendant.id : null,
    });
}

before(async () => {
    ctx = await setup();
    const { ana, bruno, escolaA, escolaB, escolaC, carla1, attendant } = ctx.seed;
    const today = new Date();
    const at = (y, m, d, h, mi = 0) => new Date(y, m, d, h, mi);
    const y = today.getFullYear();

    // 31/jan às 22:30 locais (UTC já é 01/fev!) e 1/fev: testam fuso e último dia do período
    ids.jan31 = await completedCall({ user: ana, school: escolaA, date: at(y, 0, 31, 22, 30), rating: 5, attendant });
    ids.feb1 = await completedCall({ user: bruno, school: escolaB, date: at(y, 1, 1, 9), rating: 3 });
    ids.patos = await completedCall({ user: carla1, school: escolaC, date: at(y, 1, 1, 10), rating: 5, minutes: 95 });
    ids.lastYear = await completedCall({ user: ana, school: escolaA, date: at(y - 1, 0, 15, 10), rating: 1 });
    ids.noDesc = await completedCall({ user: ana, school: escolaA, date: at(y, 0, 20, 10), description: null });
});
after(async () => { await ctx.stop(); });

test('filtros: clientes e escolas', async () => {
    assert.deepEqual(await json('/api/filters/clients'), ['CAMPINA GRANDE', 'PATOS']);
    const schools = await json('/api/filters/schools?client=PATOS');
    assert.deepEqual(schools.map((s) => s.name), ['CEI PEQUENO PRINCIPE']);
    assert.equal((await json('/api/filters/schools')).length, 3);
});

test('estatísticas: gráfico mensal só do ano corrente e por dia no fuso local', async () => {
    const data = await json('/api/statistics/chart-data');
    const m = data.monthly.data.map((d) => d.completed);
    assert.equal(m[0], 1, 'janeiro: só o do ano corrente (sem somar anos anteriores)');
    assert.equal(m[1], 2);
    assert.equal(data.summary.completedCalls, 3);
    // notas 5,4,3,2,1 — as avaliações não são filtradas por ano (como no original)
    assert.deepEqual(data.feedback.data, [2, 0, 1, 0, 1]);
});

test('estatísticas por cliente/escola', async () => {
    const patos = await json('/api/statistics/chart-data?client=PATOS');
    assert.equal(patos.summary.completedCalls, 1);
    const escolaB = await json(`/api/statistics/chart-data?school=${ctx.seed.escolaB.id}`);
    assert.equal(escolaB.summary.completedCalls, 1);
});

test('atendimentos concluídos: filtros e filtro de data no dia LOCAL', async () => {
    const y = new Date().getFullYear();
    const all = await json('/api/statistics/completed-attendances');
    assert.equal(all.length, 4, 'ignora os sem descrição');

    const jan31 = await json(`/api/statistics/completed-attendances?date=${y}-01-31`);
    assert.deepEqual(jan31.map((a) => String(a.id)), [String(ids.jan31.id)]);

    const feb1 = await json(`/api/statistics/completed-attendances?date=${y}-02-01`);
    assert.equal(feb1.length, 2);
    assert.equal(feb1.find((a) => a.client === 'PATOS').duration_minutes, 95);

    const byAttendant = await json(`/api/statistics/completed-attendances?attendant=Bot`);
    assert.ok(byAttendant.every((a) => a.attendant.name === 'Bot'));
    const byPos = await json('/api/statistics/completed-attendances?position=SECRETARIO');
    assert.equal(byPos.length, 1);

    assert.deepEqual((await json('/api/statistics/positions')).sort(), ['PROFESSOR', 'SECRETARIO']);
});

test('datas inválidas devolvem 400 em vez de 500', async () => {
    const res = await get('/api/statistics/completed-attendances?date=31/01/2025');
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Data inválida/);
    assert.equal((await get('/api/reports?start=2025-02-30&end=2025-03-01')).status, 400);
    assert.equal((await get('/api/reports?start=2025-03-02&end=2025-03-01')).status, 400);
});

test('relatório inclui o ÚLTIMO dia do período e formata nomes', async () => {
    const y = new Date().getFullYear();
    const rows = await ctx.backend.services.reports.buildRows({ start: `${y}-01-31`, end: `${y}-02-01` });
    assert.equal(rows.length, 3, '31/jan 22:30 e as duas de 01/fev');
    const row = rows.find((r) => r.name === 'Ana Paula Souza');
    assert.equal(row.school, 'EMEF Jose de Alencar');
    assert.equal(row.position, 'Professor');
    assert.equal(row.attendant_id, 'Atendente Teste');
    assert.equal(row.card_link, 'Não foi necessário');
    assert.equal(rows.find((r) => r.city === 'Patos').duration_minutes, 95);

    const onlyPatos = await ctx.backend.services.reports.buildRows({ start: `${y}-01-01`, end: `${y}-12-31`, city: 'PATOS' });
    assert.equal(onlyPatos.length, 1);
});

test('relatório em XLSX e PDF é gerado de verdade', async () => {
    const y = new Date().getFullYear();
    const xlsx = await get(`/api/reports?start=${y}-01-01&end=${y}-12-31&format=xlsx`);
    assert.equal(xlsx.status, 200);
    assert.match(xlsx.headers.get('content-disposition'), /\.xlsx/);
    const xbuf = Buffer.from(await xlsx.arrayBuffer());
    assert.equal(xbuf.subarray(0, 2).toString(), 'PK', 'xlsx é um zip');

    const pdf = await get(`/api/reports?start=${y}-01-01&end=${y}-12-31&format=pdf`);
    assert.equal(pdf.status, 200);
    const pbuf = Buffer.from(await pdf.arrayBuffer());
    assert.equal(pbuf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pbuf.length > 5000, 'PDF com conteúdo e logo');
});

test('cards: cria, valida link, conclui, reabre e filtra', async () => {
    const callId = Number(ids.jan31.id);

    assert.equal((await send('POST', '/api/cards', { callId })).status, 400);
    assert.equal((await send('POST', '/api/cards', { callId, cardLink: 'javascript:alert(1)' })).status, 400);
    assert.equal((await send('POST', '/api/cards', { callId: 999999, cardLink: 'https://x.com' })).status, 404);

    const res = await send('POST', '/api/cards', { callId, cardLink: 'trello.com/c/abc123' });
    assert.equal(res.status, 201);
    const card = await res.json();
    assert.equal(card.link, 'https://trello.com/c/abc123');
    assert.equal(card.status, 'PENDING');
    assert.match(card.chatId, /@c\.us$/);

    const done = await (await send('PUT', `/api/cards/${card.id}/complete`)).json();
    assert.equal(done.status, 'COMPLETED');
    assert.match(done.chatId, /@c\.us$/, 'cardUpdated mantém o telefone (antes vinha vazio)');

    assert.equal((await json('/api/cards?status=PENDING')).length, 0);
    assert.equal((await json('/api/cards?status=completed')).length, 1);
    assert.equal((await json('/api/cards?status=all')).length, 1);
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    assert.equal((await json(`/api/cards?date=${key}`)).length, 1, 'filtro de data usa o dia local');

    const reopened = await (await send('PUT', `/api/cards/${card.id}/reopen`)).json();
    assert.equal(reopened.status, 'PENDING');
    assert.equal((await send('PUT', '/api/cards/9999/complete')).status, 404);

    const report = await ctx.backend.services.reports.buildRows({ start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31` });
    const withCard = report.find((r) => Number(r.protocolo) === callId);
    assert.equal(withCard.card_status, 'Pendente');
});

test('contatos: lista do WhatsApp e salvar ignorados', async () => {
    const before = await json('/api/contacts');
    assert.equal(before.contacts.length, 1);
    assert.deepEqual(before.ignored, []);

    const saved = await (await send('PUT', '/api/contacts/ignored', { contacts: [{ id: '5583900000001@c.us' }] })).json();
    assert.deepEqual([saved.added, saved.removed, saved.total], [1, 0, 1]);
    assert.deepEqual((await json('/api/contacts')).ignored, ['5583900000001@c.us']);
    assert.equal(await ctx.backend.services.contacts.isDisabled('5583900000001'), true);

    // ignorado que não está mais no WhatsApp continua listado
    await send('PUT', '/api/contacts/ignored', { contacts: [{ id: '5583900000001@c.us' }, { id: '5583911111111@c.us', description: 'antigo' }] });
    const merged = await json('/api/contacts');
    assert.deepEqual(merged.contacts.map((c) => c.id).sort(), ['5583900000001@c.us', '5583911111111@c.us']);
    assert.equal(merged.contacts.find((c) => c.id === '5583911111111@c.us').name, 'antigo');

    const cleared = await (await send('PUT', '/api/contacts/ignored', { contacts: [] })).json();
    assert.deepEqual([cleared.added, cleared.removed, cleared.total], [0, 2, 0]);
    assert.equal((await send('PUT', '/api/contacts/ignored', { contacts: 'x' })).status, 400);
});

test('segurança: Host estranho bloqueado, CSP presente, sem CORS aberto, 404 em JSON', async () => {
    const res = await new Promise((resolve) => {
        http.get({ host: '127.0.0.1', port: ctx.backend.port, path: '/api/status', headers: { host: 'evil.example.com' } }, resolve);
    });
    assert.equal(res.statusCode, 403);
    res.resume();

    const ok = await get('/api/status');
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(ok.headers.get('access-control-allow-origin'), null);
    assert.equal(ok.headers.get('x-powered-by'), null);
    assert.equal((await get('/api/nao-existe')).status, 404);
    assert.deepEqual(Object.keys(await ok.json()).sort(), ['activeChats', 'completedChats', 'problems', 'waitingList']);
});

test('interface estática e dependências locais (sem CDN) são servidas', async () => {
    for (const path of ['/common/protocol.js', '/common/format.js', '/vendor/bootstrap/css/bootstrap.min.css',
        '/vendor/bootstrap/js/bootstrap.bundle.min.js', '/vendor/fontawesome/css/all.min.css',
        '/vendor/chartjs/chart.umd.js', '/socket.io/socket.io.js', '/assets/logo.svg']) {
        const res = await get(path);
        assert.equal(res.status, 200, path);
        await res.arrayBuffer();
    }
    const root = await get('/', { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/pages/overview/');
});

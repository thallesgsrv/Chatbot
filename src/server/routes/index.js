'use strict';

const express = require('express');
const { asyncHandler } = require('../http-utils');
const { CardStatus, SocketEvents } = require('../../shared/protocol');

/** Todas as rotas REST em um arquivo só: cada uma delega a um serviço. */
module.exports = function createApiRouter({ services, realtime, gateway }) {
    const { schools, statistics, reports, cards, status, contacts } = services;
    const router = express.Router();

    // --- Painel ---------------------------------------------------------
    router.get('/status', asyncHandler(async (req, res) => res.json(await status.getSnapshot())));

    // --- Filtros --------------------------------------------------------
    router.get('/filters/clients', asyncHandler(async (req, res) => res.json(await schools.listClients())));
    router.get('/filters/schools', asyncHandler(async (req, res) =>
        res.json(await schools.listSchools({ client: req.query.client }))));

    // --- Estatísticas ---------------------------------------------------
    router.get('/statistics/chart-data', asyncHandler(async (req, res) => {
        const { client, school } = req.query;
        res.json(await statistics.getChartData({ client, school }));
    }));
    router.get('/statistics/completed-attendances', asyncHandler(async (req, res) => {
        const { date, position, client, school, attendant } = req.query;
        res.json(await statistics.getCompletedAttendances({ date, position, client, school, attendant }));
    }));
    router.get('/statistics/positions', asyncHandler(async (req, res) => res.json(await statistics.getPositions())));

    // --- Relatórios -----------------------------------------------------
    router.get('/reports', asyncHandler(async (req, res) => {
        const { start, end, format, city, school } = req.query;
        await reports.send(res, { start, end, format: format === 'xlsx' ? 'xlsx' : 'pdf', city, school });
    }));

    // --- Cards ----------------------------------------------------------
    router.get('/cards', asyncHandler(async (req, res) =>
        res.json(await cards.list({ status: req.query.status, date: req.query.date }))));

    router.post('/cards', asyncHandler(async (req, res) => {
        const { callId, cardLink } = req.body || {};
        const card = await cards.create({ callId, link: cardLink });
        realtime.emit(SocketEvents.CARD_CREATED, card);
        res.status(201).json(card);
    }));

    for (const [action, target] of [['complete', CardStatus.COMPLETED], ['reopen', CardStatus.PENDING]]) {
        router.put(`/cards/:id/${action}`, asyncHandler(async (req, res) => {
            const card = await cards.setStatus(req.params.id, target);
            realtime.emit(SocketEvents.CARD_UPDATED, card);
            res.json(card);
        }));
    }

    // --- Contatos ignorados --------------------------------------------
    router.get('/contacts', asyncHandler(async (req, res) => {
        const [all, ignored] = await Promise.all([gateway.listContacts(), contacts.listDisabledPhones()]);
        res.json({ contacts: all, ignored });
    }));
    router.put('/contacts/ignored', asyncHandler(async (req, res) =>
        res.json(await contacts.replaceDisabled((req.body || {}).contacts))));

    return router;
};

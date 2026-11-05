'use strict';

const { Op } = require('sequelize');
const { CardStatus } = require('../shared/protocol');
const { ValidationError, NotFoundError } = require('./errors');
const { dayRange } = require('./date-range');

/** Aceita "trello.com/c/abc" (assume https) e rejeita esquemas perigosos como javascript:. */
function normalizeLink(rawLink) {
    let link = String(rawLink || '').trim();
    if (!link) throw new ValidationError('O link do card é obrigatório.');
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link)) link = `https://${link}`;

    let url;
    try {
        url = new URL(link);
    } catch (_) {
        throw new ValidationError('O link do card é inválido.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ValidationError('O link do card deve começar com http:// ou https://.');
    }
    return url.toString();
}

class CardService {
    constructor({ models }) {
        this.models = models;
    }

    static serialize(card) {
        const plain = card.get ? card.get({ plain: true }) : card;
        return {
            id: plain.id,
            status: plain.status,
            link: plain.link,
            createdAt: plain.createdAt,
            updatedAt: plain.updatedAt,
            callId: plain.callId,
            chatId: (plain.call && plain.call.createcall && plain.call.createcall.chatId) || null,
        };
    }

    _withChat() {
        const { Call, CreateCall } = this.models;
        return [
            {
                model: Call,
                as: 'call',
                attributes: ['id', 'createCallId'],
                include: [{ model: CreateCall, as: 'createcall', attributes: ['id', 'chatId'] }],
            },
        ];
    }

    async _findWithChat(id) {
        const card = await this.models.Card.findByPk(id, { include: this._withChat() });
        if (!card) throw new NotFoundError('Card não encontrado.');
        return CardService.serialize(card);
    }

    async create({ callId, link }) {
        if (!callId || !link) throw new ValidationError('callId e cardLink são obrigatórios.');

        const call = await this.models.Call.findByPk(callId);
        if (!call) throw new NotFoundError('Atendimento não encontrado.');

        const card = await this.models.Card.create({
            link: normalizeLink(link),
            status: CardStatus.PENDING,
            callId,
        });
        return this._findWithChat(card.id);
    }

    async list({ status, date } = {}) {
        const where = {};
        if (status && String(status).toLowerCase() !== 'all') {
            where.status = String(status).toUpperCase();
        }
        if (date) {
            const { start, end } = dayRange(date);
            where.createdAt = { [Op.between]: [start, end] };
        }

        const cards = await this.models.Card.findAll({
            where,
            include: this._withChat(),
            order: [['createdAt', 'DESC']],
        });
        return cards.map(CardService.serialize);
    }

    async setStatus(id, status) {
        const [updated] = await this.models.Card.update({ status }, { where: { id } });
        if (updated === 0) throw new NotFoundError('Card não encontrado.');
        return this._findWithChat(id);
    }

    complete(id) {
        return this.setStatus(id, CardStatus.COMPLETED);
    }

    reopen(id) {
        return this.setStatus(id, CardStatus.PENDING);
    }
}

module.exports = CardService;
module.exports.normalizeLink = normalizeLink;

'use strict';

const { Op } = require('sequelize');
const { phoneDigits } = require('../shared/format');
const { ValidationError } = require('./errors');

/** Contatos que o bot deve ignorar (tabela disablecontact). */
class ContactService {
    constructor({ models }) {
        this.models = models;
    }

    /** O telefone pode estar salvo como "5583...", ou como chatId "5583...@c.us". */
    async isDisabled(phoneOrChatId) {
        const digits = phoneDigits(phoneOrChatId);
        if (!digits) return false;

        const found = await this.models.DisableContact.findOne({
            where: { telephone: { [Op.in]: [digits, `${digits}@c.us`] } },
        });
        return Boolean(found);
    }

    async listDisabled() {
        const rows = await this.models.DisableContact.findAll({ attributes: ['telephone', 'description'] });
        return rows.map((row) => ({ telephone: row.telephone, description: row.description }));
    }

    async listDisabledPhones() {
        return (await this.listDisabled()).map((row) => row.telephone);
    }

    /**
     * Faz a lista de ignorados ficar exatamente igual a `contacts`
     * (remove os que saíram, adiciona os novos).
     *
     * @param {Array<{id: string, description?: string}>} contacts  id = chatId do WhatsApp
     */
    async replaceDisabled(contacts) {
        if (!Array.isArray(contacts)) throw new ValidationError('A lista de contatos é inválida.');
        const { DisableContact, Attendant } = this.models;

        const wanted = new Map(contacts.filter((c) => c && c.id).map((c) => [c.id, c]));
        const existing = await DisableContact.findAll();
        const existingPhones = new Set(existing.map((row) => row.telephone));

        const toRemove = [...existingPhones].filter((phone) => !wanted.has(phone));
        const toAdd = [...wanted.keys()].filter((phone) => !existingPhones.has(phone));

        if (toRemove.length > 0) {
            await DisableContact.destroy({ where: { telephone: toRemove } });
        }

        if (toAdd.length > 0) {
            // A coluna attendantId é obrigatória: registra em nome do primeiro atendente cadastrado.
            const owner = await Attendant.findOne({ order: [['id', 'ASC']] });
            if (!owner) {
                throw new ValidationError(
                    'Cadastre ao menos um atendente (inicie um atendimento) antes de ignorar contatos.'
                );
            }
            const now = new Date();
            await DisableContact.bulkCreate(
                toAdd.map((phone) => ({
                    telephone: phone,
                    description: wanted.get(phone).description || 'Desabilitado por atendente',
                    disableDate: now,
                    attendantId: wanted.get(phone).attendantId || owner.id,
                }))
            );
        }

        return {
            success: true,
            added: toAdd.length,
            removed: toRemove.length,
            total: await DisableContact.count(),
        };
    }
}

module.exports = ContactService;

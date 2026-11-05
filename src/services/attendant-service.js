'use strict';

const { ValidationError } = require('./errors');

class AttendantService {
    constructor({ models }) {
        this.models = models;
    }

    list() {
        return this.models.Attendant.findAll({ order: [['name', 'ASC']] });
    }

    async findOrCreateByName(rawName) {
        const name = String(rawName || '').trim();
        if (!name) throw new ValidationError('O nome do atendente é obrigatório.');

        const [attendant] = await this.models.Attendant.findOrCreate({ where: { name } });
        return attendant;
    }
}

module.exports = AttendantService;

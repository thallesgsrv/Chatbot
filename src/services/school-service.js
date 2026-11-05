'use strict';

const { Op, fn, col } = require('sequelize');

/** Consultas de apoio aos filtros do painel (clientes e escolas). */
class SchoolService {
    constructor({ models }) {
        this.models = models;
    }

    async listClients() {
        const rows = await this.models.School.findAll({
            attributes: [[fn('DISTINCT', col('client')), 'client']],
            where: { client: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
            order: [['client', 'ASC']],
        });
        return rows.map((row) => row.getDataValue('client')).filter(Boolean);
    }

    async listSchools({ client } = {}) {
        const where = { name: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } };
        if (client) where.client = client;

        const schools = await this.models.School.findAll({
            attributes: ['id', 'name', 'client'],
            where,
            order: [['name', 'ASC']],
        });
        return schools.map((s) => ({ id: s.id, name: s.name, client: s.client }));
    }
}

module.exports = SchoolService;

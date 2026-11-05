'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { CallStatus } = require('../shared/protocol');
const { dayRange, toLocalDateKey } = require('./date-range');

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const RATING_LABELS = ['Muito satisfeito', 'Satisfeito', 'Neutro', 'Insatisfeito', 'Muito insatisfeito'];

const DAY_SQL = 'DATE("createcall"."date")';
const MONTH_SQL = 'EXTRACT(MONTH FROM "createcall"."date")';

/** Segunda a sexta da semana de `reference` (se for domingo, a semana que acabou). */
function workWeekOf(reference = new Date()) {
    const monday = new Date(reference);
    monday.setDate(reference.getDate() - ((reference.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    return Array.from({ length: 5 }, (_, i) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        return day;
    });
}

class StatisticsService {
    constructor({ models }) {
        this.models = models;
    }

    /** JOIN createcall -> school, com filtro opcional por cliente/escola. */
    _schoolJoin({ client, school }, attributes = []) {
        const { CreateCall, School } = this.models;
        const schoolWhere = {};
        if (client) schoolWhere.client = client;
        if (school) schoolWhere.id = school;

        return [
            {
                model: CreateCall,
                as: 'createcall',
                required: true,
                attributes,
                include: [{ model: School, as: 'school', required: true, attributes, where: schoolWhere }],
            },
        ];
    }

    async _countByDay(baseWhere, filters, days) {
        const { Call } = this.models;
        const rows = await Call.findAll({
            attributes: [[literal(DAY_SQL), 'date'], [fn('COUNT', '*'), 'count']],
            where: {
                ...baseWhere,
                '$createcall.date$': {
                    [Op.gte]: days[0],
                    [Op.lte]: dayRange(toLocalDateKey(days[days.length - 1])).end,
                },
            },
            include: this._schoolJoin(filters),
            group: [literal(DAY_SQL)],
            order: [literal(`${DAY_SQL} ASC`)],
        });

        const counts = {};
        rows.forEach((row) => {
            counts[row.getDataValue('date')] = parseInt(row.getDataValue('count'), 10);
        });
        return counts;
    }

    async _countByMonth(baseWhere, filters, year) {
        const { Call } = this.models;
        const rows = await Call.findAll({
            attributes: [[literal(MONTH_SQL), 'month'], [fn('COUNT', '*'), 'count']],
            where: {
                ...baseWhere,
                '$createcall.date$': {
                    [Op.gte]: new Date(year, 0, 1),
                    [Op.lte]: new Date(year, 11, 31, 23, 59, 59, 999),
                },
            },
            include: this._schoolJoin(filters),
            group: [literal(MONTH_SQL)],
            order: [literal(`${MONTH_SQL} ASC`)],
        });

        const counts = Array(12).fill(0);
        rows.forEach((row) => {
            counts[parseInt(row.getDataValue('month'), 10) - 1] = parseInt(row.getDataValue('count'), 10);
        });
        return counts;
    }

    /** Contagem por nota 1..5 em UMA consulta (antes eram 5). */
    async _countByRating(baseWhere, filters) {
        const { Call } = this.models;
        const rows = await Call.findAll({
            attributes: ['rating', [fn('COUNT', '*'), 'count']],
            where: { ...baseWhere, rating: { [Op.between]: [1, 5] } },
            include: this._schoolJoin(filters),
            group: ['call.rating'],
            raw: true,
        });

        const byRating = {};
        rows.forEach((row) => {
            byRating[row.rating] = parseInt(row.count, 10);
        });
        return [5, 4, 3, 2, 1].map((rating) => byRating[rating] || 0);
    }

    async getChartData({ client, school } = {}, now = new Date()) {
        const filters = { client, school };
        const baseWhere = { status: CallStatus.COMPLETED, description: { [Op.ne]: null } };

        const week = workWeekOf(now);
        const weekKeys = week.map(toLocalDateKey);

        const [byDay, byMonth, ratings] = await Promise.all([
            this._countByDay(baseWhere, filters, week),
            this._countByMonth(baseWhere, filters, now.getFullYear()),
            this._countByRating(baseWhere, filters),
        ]);

        return {
            weekly: {
                labels: weekKeys,
                data: weekKeys.map((key) => ({ completed: byDay[key] || 0 })),
            },
            monthly: {
                labels: MONTH_LABELS,
                data: byMonth.map((completed) => ({ completed })),
            },
            feedback: { labels: RATING_LABELS, data: ratings },
            summary: { completedCalls: byMonth.reduce((sum, n) => sum + n, 0) },
        };
    }

    async getCompletedAttendances({ date, position, client, school, attendant } = {}) {
        const { Call, CreateCall, School, User, Attendant } = this.models;

        const where = { status: CallStatus.COMPLETED, description: { [Op.ne]: null } };
        if (date) {
            const { start, end } = dayRange(date);
            where.dateTimeFinish = { [Op.between]: [start, end] };
        }
        if (position) where.position = position;
        if (attendant) where.attendantId = attendant === 'Bot' ? null : attendant;

        const schoolWhere = {};
        if (school) schoolWhere.id = school;
        if (client) schoolWhere.client = client;

        const calls = await Call.findAll({
            where,
            include: [
                {
                    model: CreateCall,
                    as: 'createcall',
                    required: true,
                    attributes: ['date'],
                    include: [
                        { model: School, as: 'school', required: true, attributes: ['id', 'name', 'client'], where: schoolWhere },
                        { model: User, as: 'user', attributes: ['name'] },
                    ],
                },
                { model: Attendant, as: 'attendant', attributes: ['id', 'name'] },
            ],
            order: [['dateTimeFinish', 'DESC']],
        });

        return calls.map((call) => {
            const started = call.createcall.date;
            // registros antigos podem ter sido concluídos sem data de término
            const finished = call.dateTimeFinish || started;
            return {
                id: call.id,
                name: call.createcall.user ? call.createcall.user.name : '',
                position: call.position,
                description: call.description,
                school: {
                    id: call.createcall.school.id,
                    name: call.createcall.school.name,
                    client: call.createcall.school.client,
                },
                client: call.createcall.school.client,
                attendant: call.attendant
                    ? { id: call.attendant.id, name: call.attendant.name }
                    : { id: null, name: 'Bot' },
                date: started.toLocaleString('pt-BR'),
                date_completed: finished.toLocaleString('pt-BR'),
                duration_minutes: Math.max(0, Math.floor((finished - started) / 60000)),
            };
        });
    }

    async getPositions() {
        const rows = await this.models.Call.findAll({
            attributes: [[fn('DISTINCT', col('position')), 'position']],
            where: { position: { [Op.ne]: null } },
            order: [['position', 'ASC']],
        });
        return rows.map((row) => row.getDataValue('position'));
    }
}

module.exports = StatisticsService;
module.exports.workWeekOf = workWeekOf;

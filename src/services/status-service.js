'use strict';

const { Op } = require('sequelize');
const { CallStatus } = require('../shared/protocol');

/**
 * Monta o "retrato" do painel: quem está em atendimento, na fila, com problema
 * pendente e os últimos concluídos. Antes eram 4 queries quase idênticas
 * duplicadas em bot.js e socketmanager.js; agora são 2.
 */
class StatusService {
    constructor({ models, completedLimit = 10 }) {
        this.models = models;
        this.completedLimit = completedLimit;
    }

    _include() {
        const { CreateCall, User, School } = this.models;
        return [
            {
                model: CreateCall,
                as: 'createcall',
                include: [
                    { model: User, as: 'user' },
                    { model: School, as: 'school' },
                ],
            },
        ];
    }

    static flatten(call, queuePosition = '') {
        const plain = call.get({ plain: true });
        const user = (plain.createcall && plain.createcall.user) || {};
        const school = (plain.createcall && plain.createcall.school) || {};
        return {
            id: plain.id,
            chatId: plain.createcall ? plain.createcall.chatId : '',
            name: user.name || '',
            city: school.client || '',
            position: plain.position || user.type || '',
            school: school.name || '',
            description: plain.description || '',
            queuePosition,
            status: plain.status,
            attendantId: plain.attendantId || null,
        };
    }

    async getSnapshot() {
        const { Call } = this.models;
        const include = this._include();

        const [open, completed] = await Promise.all([
            Call.findAll({
                where: { status: { [Op.in]: [CallStatus.ACTIVE, CallStatus.PENDING, CallStatus.WAITING] } },
                order: [['id', 'DESC']],
                include,
            }),
            Call.findAll({
                where: { status: CallStatus.COMPLETED },
                order: [['dateTimeFinish', 'DESC']],
                limit: this.completedLimit,
                include,
            }),
        ]);

        const activeChats = open
            .filter((c) => c.status === CallStatus.ACTIVE || c.status === CallStatus.PENDING)
            .map((c) => StatusService.flatten(c));

        const waitingList = open
            .filter((c) => c.status === CallStatus.WAITING)
            .sort((a, b) => Number(a.id) - Number(b.id))
            .map((c, index) => StatusService.flatten(c, index + 1));

        // "Problemas reportados" = pendentes que ainda não foram assumidos por um atendente
        const problems = open
            .filter((c) => c.status === CallStatus.PENDING && !c.attendantId)
            .map((c) => StatusService.flatten(c));

        return {
            activeChats,
            waitingList,
            problems,
            completedChats: completed.map((c) => StatusService.flatten(c)),
        };
    }
}

module.exports = StatusService;

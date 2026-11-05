'use strict';

const { CallStatus } = require('../shared/protocol');

/**
 * Operações sobre atendimentos ("calls").
 *
 * Um atendimento é formado por dois registros: `createcall` (quem/onde/quando
 * abriu) e `call` (estado, descrição, avaliação). O padrão "buscar o último
 * createcall do chat e depois o call dele" se repetia ~8 vezes no código antigo;
 * agora é uma única consulta em findLatestByChatId.
 */
class CallService {
    constructor({ models, sequelize }) {
        this.models = models;
        this.sequelize = sequelize;
    }

    /** Atendimento mais recente de um chat, com usuário, escola e atendente. */
    async findLatestByChatId(chatId) {
        const { Call, CreateCall, User, School, Attendant } = this.models;
        return Call.findOne({
            include: [
                {
                    model: CreateCall,
                    as: 'createcall',
                    required: true,
                    where: { chatId },
                    include: [
                        { model: User, as: 'user' },
                        { model: School, as: 'school' },
                    ],
                },
                { model: Attendant, as: 'attendant', required: false },
            ],
            order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'DESC'], ['id', 'DESC']],
        });
    }

    findById(id) {
        return this.models.Call.findByPk(id);
    }

    /** Abre um atendimento (createcall + call) de forma atômica. */
    async open({ userId, schoolId, chatId, position, status }) {
        const { CreateCall, Call } = this.models;
        return this.sequelize.transaction(async (transaction) => {
            const createCall = await CreateCall.create(
                { userId, schoolId, chatId, date: new Date() },
                { transaction }
            );
            const call = await Call.create(
                { createCallId: createCall.id, position, status },
                { transaction }
            );
            return { call, createCall };
        });
    }

    setDescription(call, description) {
        return call.update({ description });
    }

    /** O usuário descreveu o problema: o atendimento passa a aguardar um humano. */
    markPending(call, description) {
        return call.update({ description, status: CallStatus.PENDING });
    }

    assignAttendant(call, attendantId) {
        return call.update({ attendantId });
    }

    rate(call, rating) {
        return call.update({ rating });
    }

    /**
     * Conclui o atendimento. Idempotente: concluir duas vezes não altera a
     * data de término original.
     *
     * @returns {Promise<boolean>} true se este chamado acabou de ser concluído
     *          (use para disparar a promoção da fila UMA única vez).
     */
    async complete(call) {
        const alreadyDone = call.status === CallStatus.COMPLETED && Boolean(call.dateTimeFinish);
        if (alreadyDone) return false;

        await call.update({
            status: CallStatus.COMPLETED,
            dateTimeFinish: call.dateTimeFinish || new Date(),
        });
        return true;
    }
}

module.exports = CallService;

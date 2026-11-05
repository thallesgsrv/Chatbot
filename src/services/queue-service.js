'use strict';

const Mutex = require('./mutex');
const { CallStatus } = require('../shared/protocol');

/**
 * Fila de espera. Só conhece o banco; avisos por WhatsApp ficam na camada do bot.
 *
 * Regra herdada do sistema original: o bot atende até `maxActiveChats` usuários
 * simultâneos (status ACTIVE). Quem chega depois entra em WAITING e é promovido,
 * por ordem de chegada, quando um atendimento é concluído.
 */
class QueueService {
    constructor({ models, maxActiveChats = 1 }) {
        this.models = models;
        this.maxActiveChats = maxActiveChats;
        this.mutex = new Mutex();
    }

    countActive() {
        return this.models.Call.count({
            where: { status: CallStatus.ACTIVE, dateTimeFinish: null },
        });
    }

    async hasFreeSlot() {
        return (await this.countActive()) < this.maxActiveChats;
    }

    listWaiting() {
        const { Call, CreateCall } = this.models;
        return Call.findAll({
            where: { status: CallStatus.WAITING, dateTimeFinish: null },
            include: [{ model: CreateCall, as: 'createcall' }],
            order: [['createCallId', 'ASC']],
        });
    }

    /** Posição (1 = próximo) de um chat na fila. */
    async positionOf(chatId) {
        const waiting = await this.listWaiting();
        const index = waiting.findIndex((call) => call.createcall && call.createcall.chatId === chatId);
        return index >= 0 ? index + 1 : waiting.length + 1;
    }

    /**
     * Decide, de forma atômica, se o novo atendimento entra ativo ou em espera.
     * `open(status)` deve criar o atendimento com o status recebido.
     *
     * @returns {Promise<{ result: any, queued: boolean, position: number }>}
     */
    admit(chatId, open) {
        return this.mutex.run(async () => {
            const hasSlot = await this.hasFreeSlot();
            const status = hasSlot ? CallStatus.ACTIVE : CallStatus.WAITING;
            const result = await open(status);
            const position = hasSlot ? 0 : await this.positionOf(chatId);
            return { result, queued: !hasSlot, position };
        });
    }

    /**
     * Promove o primeiro da fila para ACTIVE.
     * @returns {Promise<object|null>} o atendimento promovido (com createcall.user) ou null
     */
    promoteNext() {
        const { Call, CreateCall, User } = this.models;
        return this.mutex.run(async () => {
            const next = await Call.findOne({
                where: { status: CallStatus.WAITING, dateTimeFinish: null },
                include: [
                    {
                        model: CreateCall,
                        as: 'createcall',
                        include: [{ model: User, as: 'user' }],
                    },
                ],
                order: [['createCallId', 'ASC']],
            });
            if (!next) return null;

            await next.update({ status: CallStatus.ACTIVE });
            return next;
        });
    }
}

module.exports = QueueService;

'use strict';

const { EventEmitter } = require('events');
const { CallStatus } = require('../shared/protocol');
const { formatName } = require('../shared/format');
const { NotFoundError, ValidationError } = require('../services/errors');
const { Step } = require('./conversation-store');
const { greetings, finished, format } = require('./messages');

/**
 * Orquestra o ciclo de vida de um atendimento (fora das conversas do usuário):
 * concluir, promover da fila, o atendente assumir/encerrar, chat fechado.
 *
 * Regra central: concluir um atendimento promove o próximo da fila exatamente
 * UMA vez. No código antigo a promoção rodava de novo quando o usuário
 * respondia a avaliação, podendo promover duas pessoas por vaga liberada.
 *
 * Emite 'promoted' ({ chatId }) quando alguém sai da fila; o fluxo de problemas
 * escuta e mostra o menu (evita dependência circular entre as classes).
 */
class AttendanceCoordinator extends EventEmitter {
    constructor({ calls, queue, attendants, messenger, store, realtime, replyDelayMs = 0 }) {
        super();
        Object.assign(this, { calls, queue, attendants, messenger, store, realtime, replyDelayMs });
    }

    /** Conclui o atendimento e, se acabou de ser concluído, chama o próximo da fila. */
    async finishCall(call) {
        const transitioned = await this.calls.complete(call);
        if (transitioned) await this.promoteNext();
        await this.realtime.emitStatus();
        return transitioned;
    }

    async promoteNext() {
        const promoted = await this.queue.promoteNext();
        if (!promoted) return null;

        const chatId = promoted.createcall.chatId;
        const name = formatName(promoted.createcall.user && promoted.createcall.user.name);

        await this.messenger.send(chatId, format(greetings.nextInLine, name));
        this.emit('promoted', { chatId });
        await this.notifyQueuePositions();
        return promoted;
    }

    /** Avisa quem continua esperando da nova posição na fila. */
    async notifyQueuePositions() {
        const waiting = await this.queue.listWaiting();
        for (const [index, call] of waiting.entries()) {
            await this.messenger.send(call.createcall.chatId, format(greetings.queueUpdate, index + 1), { delay: 1000 });
        }
    }

    /** Resposta a quem escreve enquanto espera na fila. */
    async replyQueuePosition(chatId) {
        const position = await this.queue.positionOf(chatId);
        await this.messenger.send(chatId, format(greetings.queueUpdate, position));
    }

    /** Atendente clicou em "Atender" num problema reportado. */
    async attendProblem({ chatId, attendantName }) {
        if (!chatId || !attendantName) throw new ValidationError('ChatId e nome do atendente são obrigatórios.');

        const attendant = await this.attendants.findOrCreateByName(attendantName);
        const call = await this.calls.findLatestByChatId(chatId);
        if (!call) throw new NotFoundError('Atendimento não encontrado para este chat.');

        await this.calls.assignAttendant(call, attendant.id);
        this.store.set(chatId, Step.HUMAN);
        await this.messenger.send(chatId, format(greetings.attendantIntroduction, attendant.name));
        await this.realtime.emitStatus();
    }

    /** Atendente clicou em "Finalizar": conclui, pede avaliação e chama o próximo. */
    async endChat({ chatId }) {
        if (!chatId) throw new ValidationError('ChatId é obrigatório.');

        const call = await this.calls.findLatestByChatId(chatId);
        if (!call) throw new NotFoundError('Atendimento não encontrado para este chat.');
        if (call.status === CallStatus.COMPLETED) return;

        this.store.set(chatId, Step.RATING, { callId: call.id });
        await this.finishCall(call);
        await this.messenger.send(chatId, finished.feedbackRequest);
    }

    /** O chat foi fechado direto no WhatsApp. */
    async handleChatClosed(chatId) {
        const call = await this.calls.findLatestByChatId(chatId);
        this.store.clear(chatId);
        if (call) await this.finishCall(call);
        else await this.realtime.emitStatus();
    }
}

module.exports = AttendanceCoordinator;

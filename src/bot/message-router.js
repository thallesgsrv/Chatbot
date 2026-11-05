'use strict';

const { Step } = require('./conversation-store');
const { errors } = require('./messages');

const SEEN_TTL_MS = 60000;

/**
 * Recebe cada mensagem do WhatsApp, descarta o que deve ser ignorado e entrega
 * ao passo certo da conversa. É a única "tabela de decisão" do bot: o estado
 * da conversa (Step) determina quem trata a mensagem.
 */
class MessageRouter {
    constructor({ store, contacts, coordinator, screening, problem, feedback, messenger, startedAt = Date.now() }) {
        Object.assign(this, { store, contacts, coordinator, screening, problem, feedback, messenger, startedAt });
        this.seen = new Map(); // id da mensagem -> expira em

        this.handlers = {
            [Step.PRIVACY]: (ctx) => screening.onPrivacy(ctx),
            [Step.IDENTIFIER]: (ctx) => screening.onIdentifier(ctx),
            [Step.SELECT_TYPE]: (ctx) => screening.onTypeSelection(ctx),
            [Step.SELECT_SCHOOL]: (ctx) => screening.onSchoolSelection(ctx),
            [Step.IN_QUEUE]: (ctx) => coordinator.replyQueuePosition(ctx.chatId),
            [Step.MAIN_MENU]: (ctx) => problem.onMainMenu(ctx),
            [Step.SUB_MENU]: (ctx) => problem.onSubMenu(ctx),
            [Step.VIDEO_FEEDBACK]: (ctx) => problem.onVideoFeedback(ctx),
            [Step.DESCRIBE]: (ctx) => problem.onDescribe(ctx),
            [Step.RATING]: (ctx) => feedback.onRating(ctx),
            [Step.HUMAN]: async () => {}, // atendente humano cuida; o bot fica em silêncio
        };
    }

    _isDuplicate(message) {
        const now = Date.now();
        for (const [key, expires] of this.seen) if (expires < now) this.seen.delete(key);

        const key = `${message.id || now}_${message.chatId}`;
        if (this.seen.has(key)) return true;
        this.seen.set(key, now + SEEN_TTL_MS);
        return false;
    }

    async handle(message) {
        const { chatId } = message;

        if (!chatId || message.fromMe || message.isGroup) return;
        if (message.timestampMs < this.startedAt) return; // mensagens de antes de ligar o bot
        if (this._isDuplicate(message)) return;

        try {
            if (await this.contacts.isDisabled(chatId)) return;

            const state = this.store.get(chatId);
            const context = {
                chatId,
                state,
                raw: message.body.trim(), // texto original (descrições mantêm maiúsculas/minúsculas)
                text: message.body.trim().toLowerCase(), // para comparar com comandos
            };

            if (!state) return await this.screening.start(chatId);
            return await this.handlers[state.step](context);
        } catch (error) {
            console.error(`[router] erro ao processar mensagem de ${chatId}:`, error);
            await this.messenger.send(chatId, errors.tryAgainLater);
        }
    }
}

module.exports = MessageRouter;

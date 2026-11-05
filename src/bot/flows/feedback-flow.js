'use strict';

const { finished, errors } = require('../messages');
const { Step } = require('../conversation-store');

/** Avaliação final (1 a 5) depois que o atendimento foi concluído. */
class FeedbackFlow {
    constructor({ store, messenger, calls, realtime, replyDelayMs = 0 }) {
        Object.assign(this, { store, messenger, calls, realtime, replyDelayMs });
    }

    async onRating({ chatId, text, state }) {
        const rating = parseInt(text, 10);
        if (!(rating >= 1 && rating <= 5)) {
            return this.messenger.send(chatId, finished.feedbackInvalid, { delay: this.replyDelayMs });
        }

        const call = state.callId && (await this.calls.findById(state.callId));
        if (!call) {
            this.store.clear(chatId);
            return this.messenger.send(chatId, errors.tryAgainLater);
        }

        await this.calls.rate(call, rating);
        this.store.clear(chatId);
        await this.messenger.send(chatId, finished.feedbackThank, { delay: this.replyDelayMs });
        await this.messenger.send(chatId, finished.chatCompleted, { delay: this.replyDelayMs });
        await this.realtime.emitStatus();
    }
}

module.exports = FeedbackFlow;

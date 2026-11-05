'use strict';

const { Step } = require('../conversation-store');
const { dialogs, errors, finished, greetings, problemCatalog, format } = require('../messages');

const YES = new Set(['sim', 's']);
const NO = new Set(['não', 'nao', 'n']);

/**
 * Depois da triagem: menu de problemas -> subtópico -> vídeo de ajuda ->
 * (se não resolveu) descrição para um atendente humano.
 */
class ProblemFlow {
    constructor({ store, messenger, calls, coordinator, realtime, replyDelayMs = 0 }) {
        Object.assign(this, { store, messenger, calls, coordinator, realtime, replyDelayMs });
        this.reply = (chatId, text) => this.messenger.send(chatId, text, { delay: this.replyDelayMs });
    }

    async showMenu(chatId) {
        this.store.set(chatId, Step.MAIN_MENU);
        await this.reply(chatId, dialogs.problemOptions);
    }

    async onMainMenu({ chatId, text }) {
        const topic = problemCatalog.find((t) => t.menuNumber === text);
        if (topic) {
            this.store.set(chatId, Step.SUB_MENU, { topicId: topic.id });
            return this.reply(chatId, topic.title);
        }

        if (text === '5') {
            // Suporte RFACE é atendido por outro canal: informa o contato e encerra
            await this.reply(chatId, dialogs.rfaceContact);
            this.store.clear(chatId);
            const call = await this.calls.findLatestByChatId(chatId);
            if (call) await this.coordinator.finishCall(call);
            return;
        }

        if (text === '6') {
            this.store.set(chatId, Step.DESCRIBE);
            return this.reply(chatId, dialogs.describeIssue);
        }

        if (text !== 'voltar') await this.reply(chatId, errors.invalidOption);
        return this.reply(chatId, dialogs.problemOptions);
    }

    async onSubMenu({ chatId, text, state }) {
        const topic = problemCatalog.find((t) => t.id === state.topicId);
        if (!topic || text === 'voltar') return this.showMenu(chatId);

        const option = topic.options[text];
        if (!option) {
            await this.reply(chatId, errors.invalidOption);
            return this.reply(chatId, topic.title);
        }

        const call = await this.calls.findLatestByChatId(chatId);
        if (call) await this.calls.setDescription(call, `${topic.label} - ${option}`);

        const video = topic.videos[text];
        if (video) {
            this.store.set(chatId, Step.VIDEO_FEEDBACK, { callId: call && call.id });
            await this.reply(chatId, format(dialogs.watchVideo, video));
            return this.reply(chatId, dialogs.videoFeedback);
        }

        this.store.clear(chatId);
        return this.reply(chatId, finished.problemRegistered);
    }

    async onVideoFeedback({ chatId, text, state }) {
        if (YES.has(text)) {
            const call = state.callId && (await this.calls.findById(state.callId));
            this.store.set(chatId, Step.RATING, { callId: state.callId });
            if (call) await this.coordinator.finishCall(call);
            await this.reply(chatId, finished.helpfulVideo);
            return this.reply(chatId, finished.feedbackRequest);
        }

        if (NO.has(text)) {
            this.store.set(chatId, Step.DESCRIBE);
            await this.reply(chatId, dialogs.feedbackNegative);
            return this.reply(chatId, dialogs.describeIssue);
        }

        await this.reply(chatId, errors.invalidOption);
        return this.reply(chatId, dialogs.videoFeedback);
    }

    /** O usuário descreveu o problema: vira PENDING e um atendente é avisado. */
    async onDescribe({ chatId, raw }) {
        if (!raw) return; // mensagem sem texto (figurinha, áudio...)

        const call = await this.calls.findLatestByChatId(chatId);
        if (!call) {
            this.store.clear(chatId);
            return this.reply(chatId, errors.tryAgainLater);
        }

        await this.calls.markPending(call, raw);
        this.store.set(chatId, Step.HUMAN);

        const { user, school } = call.createcall;
        this.realtime.notifyUserProblem({
            description: raw,
            chatId,
            name: user ? user.name : '',
            city: school ? school.client : '',
            position: call.position,
            school: school ? school.name : '',
        });
        await this.realtime.emitStatus();
        await this.reply(chatId, greetings.attendantAssigned);
    }
}

module.exports = ProblemFlow;

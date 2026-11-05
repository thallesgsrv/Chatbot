'use strict';

const Messenger = require('./messenger');
const { ConversationStore } = require('./conversation-store');
const AttendanceCoordinator = require('./attendance-coordinator');
const ScreeningFlow = require('./flows/screening-flow');
const ProblemFlow = require('./flows/problem-flow');
const FeedbackFlow = require('./flows/feedback-flow');
const MessageRouter = require('./message-router');

/**
 * Monta o bot: liga serviços, fluxos e roteador.
 * @returns {{ coordinator, router, store, messenger }}
 */
function createBot({ config, services, realtime, gateway }) {
    const { replyDelayMs, dedupeWindowMs } = config.bot;

    const store = new ConversationStore();
    const messenger = new Messenger({ gateway, dedupeWindowMs });

    const coordinator = new AttendanceCoordinator({
        calls: services.calls,
        queue: services.queue,
        attendants: services.attendants,
        messenger,
        store,
        realtime,
        replyDelayMs,
    });

    const problem = new ProblemFlow({ store, messenger, calls: services.calls, coordinator, realtime, replyDelayMs });
    const feedback = new FeedbackFlow({ store, messenger, calls: services.calls, realtime, replyDelayMs });
    const screening = new ScreeningFlow({
        store,
        messenger,
        identity: services.identity,
        calls: services.calls,
        queue: services.queue,
        problemFlow: problem,
        realtime,
    });

    // Quem sai da fila recebe o menu de problemas
    coordinator.on('promoted', ({ chatId }) => {
        problem.showMenu(chatId).catch((e) => console.error('[bot] erro ao mostrar menu ao promovido:', e));
    });

    const router = new MessageRouter({
        store,
        contacts: services.contacts,
        coordinator,
        screening,
        problem,
        feedback,
        messenger,
        startedAt: gateway.startedAt || Date.now(),
    });

    gateway.onMessage((message) => router.handle(message));
    gateway.onChatClosed((chatId) => coordinator.handleChatClosed(chatId));

    return { coordinator, router, store, messenger };
}

module.exports = { createBot };

'use strict';

/**
 * Em que ponto da conversa cada chat está.
 *
 * Substitui dois mapas separados (`userCurrentTopic` em Screening e em
 * ProblemManager), o `sharedState` e o Set `humanAttendedChats`, que precisavam
 * ser mantidos em sincronia manualmente.
 *
 * Observação: o estado fica em memória; reiniciar o app reinicia as conversas.
 */
const Step = Object.freeze({
    PRIVACY: 'PRIVACY', // aguardando aceite dos termos
    IDENTIFIER: 'IDENTIFIER', // aguardando CPF/matrícula
    SELECT_TYPE: 'SELECT_TYPE', // escolher tipo de vínculo
    SELECT_SCHOOL: 'SELECT_SCHOOL', // escolher escola
    IN_QUEUE: 'IN_QUEUE', // na fila de espera
    MAIN_MENU: 'MAIN_MENU', // escolher categoria do problema
    SUB_MENU: 'SUB_MENU', // escolher subtópico
    VIDEO_FEEDBACK: 'VIDEO_FEEDBACK', // o vídeo ajudou?
    DESCRIBE: 'DESCRIBE', // descrever o problema para um humano
    HUMAN: 'HUMAN', // atendente humano assumiu: o bot fica em silêncio
    RATING: 'RATING', // avaliação 1-5
});

class ConversationStore {
    constructor() {
        this.states = new Map();
    }

    /** @returns {{step: string, [key: string]: any} | undefined} */
    get(chatId) {
        return this.states.get(chatId);
    }

    set(chatId, step, data = {}) {
        this.states.set(chatId, { step, ...data });
    }

    clear(chatId) {
        this.states.delete(chatId);
    }

    isHumanAttended(chatId) {
        const state = this.states.get(chatId);
        return Boolean(state && state.step === Step.HUMAN);
    }
}

module.exports = { ConversationStore, Step };

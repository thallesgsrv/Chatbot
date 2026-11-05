'use strict';

const { SocketEvents } = require('../shared/protocol');

/**
 * Único ponto por onde o backend fala com a interface em tempo real.
 * Antes havia ~15 eventos, vários emitidos sem nenhum ouvinte e `statusUpdate`
 * às vezes sem payload (a tela ignorava). Agora `statusUpdate` sempre leva o
 * retrato completo.
 */
class Realtime {
    constructor({ statusService }) {
        this.io = null;
        this.statusService = statusService;
    }

    /** O Socket.IO só existe depois que o servidor HTTP é criado. */
    attach(io) {
        this.io = io;
    }

    emit(event, payload) {
        if (this.io) this.io.emit(event, payload);
    }

    /** Recalcula e envia o retrato atual do painel a todos os clientes. */
    async emitStatus() {
        try {
            this.emit(SocketEvents.STATUS_UPDATE, await this.statusService.getSnapshot());
        } catch (error) {
            console.error('[realtime] falha ao enviar statusUpdate:', error.message);
        }
    }

    notifyUserProblem(payload) {
        this.emit(SocketEvents.USER_PROBLEM, payload);
    }
}

module.exports = Realtime;

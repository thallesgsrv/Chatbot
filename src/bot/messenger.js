'use strict';

/**
 * Envio de mensagens: UMA fila por chat (as mensagens saem na ordem), pausa
 * opcional antes de enviar e descarte de mensagens idênticas em sequência.
 * Nunca lança: falha de envio é registrada e o fluxo continua.
 */
class Messenger {
    constructor({ gateway, dedupeWindowMs = 2000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
        this.gateway = gateway;
        this.dedupeWindowMs = dedupeWindowMs;
        this.sleep = sleep;
        this.queues = new Map(); // chatId -> Promise
        this.last = new Map(); // chatId -> { text, at }
    }

    /**
     * @param {string} chatId
     * @param {string} text
     * @param {{ delay?: number }} [options]  delay: espera (ms) antes de enviar
     * @returns {Promise<boolean>} true se foi enviada
     */
    send(chatId, text, { delay = 0 } = {}) {
        const previous = this.queues.get(chatId) || Promise.resolve();
        const current = previous.then(() => this._deliver(chatId, text, delay));
        this.queues.set(chatId, current.catch(() => {}));
        return current;
    }

    /** Resolve quando todas as mensagens enfileiradas foram processadas (útil em testes). */
    async idle() {
        let pending;
        do {
            pending = [...this.queues.values()];
            await Promise.all(pending);
        } while ([...this.queues.values()].some((q, i) => q !== pending[i]));
    }

    async _deliver(chatId, text, delay) {
        if (!text) {
            console.error(`[messenger] mensagem vazia ignorada (chat ${chatId})`);
            return false;
        }

        const last = this.last.get(chatId);
        if (last && last.text === text && Date.now() - last.at < this.dedupeWindowMs) return false;

        try {
            if (delay > 0) await this.sleep(delay);
            await this.gateway.sendText(chatId, text);
            this.last.set(chatId, { text, at: Date.now() });
            return true;
        } catch (error) {
            console.error(`[messenger] falha ao enviar para ${chatId}:`, error.message);
            return false;
        }
    }
}

module.exports = Messenger;

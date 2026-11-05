'use strict';

/**
 * Exclusão mútua para código assíncrono (execução em série, na ordem de chegada).
 * Usado para que "ver se há vaga" + "criar atendimento" + "promover da fila"
 * nunca se atropelem quando duas mensagens chegam ao mesmo tempo.
 */
class Mutex {
    constructor() {
        this._tail = Promise.resolve();
    }

    run(task) {
        const result = this._tail.then(() => task());
        // a fila segue mesmo que a tarefa falhe
        this._tail = result.catch(() => {});
        return result;
    }
}

module.exports = Mutex;

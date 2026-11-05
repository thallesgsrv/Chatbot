/**
 * Contrato compartilhado entre servidor e interface (UMD).
 *
 * No Node:     const { CallStatus, SocketEvents } = require('../shared/protocol');
 * No browser:  <script src="/shared/protocol.js"> expõe window.Protocol
 *
 * Ter UM lugar com os nomes de eventos evita o problema anterior: eventos que
 * o servidor emitia sem ninguém ouvir (e vice-versa) por erro de digitação.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Protocol = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    const CallStatus = Object.freeze({
        PENDING: 'PENDING', // usuário descreveu o problema; aguardando um atendente
        ACTIVE: 'ACTIVE', // em atendimento (bot ou humano)
        WAITING: 'WAITING', // na fila de espera
        COMPLETED: 'COMPLETED',
    });

    const CardStatus = Object.freeze({
        PENDING: 'PENDING',
        COMPLETED: 'COMPLETED',
    });

    const SocketEvents = Object.freeze({
        // servidor -> interface
        STATUS_UPDATE: 'statusUpdate', // payload: snapshot completo (ver StatusService)
        USER_PROBLEM: 'userProblem', // novo problema reportado (dispara notificação)
        CARD_CREATED: 'cardCreated',
        CARD_UPDATED: 'cardUpdated',
        ATTENDANT_LIST: 'attendantList',
        SERVER_ERROR: 'serverError',

        // interface -> servidor
        GET_ATTENDANTS: 'getAttendants',
        ATTEND_PROBLEM: 'attendProblem',
        END_CHAT: 'endChat',
    });

    return { CallStatus, CardStatus, SocketEvents };
});

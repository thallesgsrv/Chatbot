'use strict';

const { SocketEvents } = require('../shared/protocol');

/**
 * Comandos que a interface envia ao backend. A lógica fica em `attendance`
 * (camada do bot); aqui só se valida e se encaminha.
 */
module.exports = function registerSockets({ io, services, attendance, realtime }) {
    io.on('connection', (socket) => {
        const fail = (message, error) => {
            console.error(`[socket] ${message}:`, error && error.message);
            socket.emit(SocketEvents.SERVER_ERROR, { message });
        };

        // Já entrega o retrato atual a quem acabou de abrir a tela
        services.status.getSnapshot()
            .then((snapshot) => socket.emit(SocketEvents.STATUS_UPDATE, snapshot))
            .catch((e) => fail('Erro ao carregar o painel', e));

        socket.on(SocketEvents.GET_ATTENDANTS, async () => {
            try {
                socket.emit(SocketEvents.ATTENDANT_LIST, await services.attendants.list());
            } catch (e) { fail('Erro ao buscar atendentes', e); }
        });

        socket.on(SocketEvents.ATTEND_PROBLEM, async ({ chatId, attendantName } = {}) => {
            try {
                await attendance.attendProblem({ chatId, attendantName });
            } catch (e) { fail(e.status ? e.message : 'Erro ao assumir o atendimento', e); }
        });

        socket.on(SocketEvents.END_CHAT, async ({ chatId } = {}) => {
            try {
                await attendance.endChat({ chatId });
            } catch (e) { fail(e.status ? e.message : 'Erro ao finalizar o atendimento', e); }
        });
    });

    return realtime;
};

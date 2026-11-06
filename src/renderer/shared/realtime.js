/** Conexão Socket.IO única da página (o cliente é servido pelo próprio backend). */
export const socket = window.io();

export function on(event, handler) {
    socket.on(event, handler);
    return () => socket.off(event, handler);
}

export const emit = (event, payload) => socket.emit(event, payload);

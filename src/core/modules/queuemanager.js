const Call = require('../../models/entities/call.js');
const CreateCall = require('../../models/entities/createcall.js');
const greetings = require('../messages/greetings.json');

class QueueManager {
    constructor(io, botConnection, config) {
        this.io = io;
        this.botConnection = botConnection;
        this.maxActiveChats = config?.MAX_ACTIVE_CHATS || 1;
    }

    async checkQueueStatus(chatId) {
        try {
            const activeCount = await Call.count({
                where: { 
                    status: 'ACTIVE',
                    dateTimeFinish: null
                }
            });

            const shouldQueue = activeCount >= this.maxActiveChats;
            let position = 0;

            if (shouldQueue) {
                position = await this.getQueuePosition(chatId);
            }

            return {
                shouldQueue,
                position,
                activeCount
            };
        } catch (error) {
            console.error('Erro ao verificar status da fila:', error);
            throw error;
        }
    }

    async getQueuePosition(chatId) {
        try {
            const waitingCalls = await Call.findAll({
                where: { 
                    status: 'WAITING',
                    dateTimeFinish: null
                },
                include: [{
                    model: CreateCall,
                    as: 'createcall'
                }],
                order: [['createCallId', 'ASC']]
            });

            // Encontra a posição atual do chat na fila
            const position = waitingCalls.findIndex(call => 
                call.createcall?.chatId === chatId
            ) + 1;

            return position > 0 ? position : waitingCalls.length + 1;
        } catch (error) {
            console.error('Erro ao calcular posição na fila:', error);
            return 1;
        }
    }

    async addToQueue(call) {
        try {
            let callWithCreateCall = call;
            if (!call.createcall) {
                callWithCreateCall = await Call.findOne({
                    where: { id: call.id },
                    include: [{
                        model: CreateCall,
                        as: 'createcall'
                    }]
                });
            }

            if (!callWithCreateCall || !callWithCreateCall.createcall) {
                throw new Error('Não foi possível carregar os dados do atendimento');
            }

            await callWithCreateCall.update({ 
                status: 'WAITING'
            });
            
            const position = await this.getQueuePosition(callWithCreateCall.createcall.chatId);
            
            // Notifica usuário sobre sua posição inicial na fila
            await this.notifyQueuePosition(
                callWithCreateCall.createcall.chatId, 
                position,
                true // indica primeira notificação
            );
            
            if (this.io) {
                this.io.emit('queueUpdate', {
                    chatId: callWithCreateCall.createcall.chatId,
                    position,
                    isNew: true
                });
            }

            return position;
        } catch (error) {
            console.error('Erro ao adicionar à fila:', error);
            throw error;
        }
    }

    async promoteNextInQueue() {
        try {
            const activeCount = await Call.count({
                where: { 
                    status: 'ACTIVE',
                    dateTimeFinish: null
                }
            });

            if (activeCount >= this.maxActiveChats) {
                console.log('Limite de chats ativos atingido');
                return null;
            }

            const nextInQueue = await Call.findOne({
                where: { status: 'WAITING' },
                include: [{
                    model: CreateCall,
                    as: 'createcall'
                }],
                order: [['createCallId', 'ASC']]
            });

            if (!nextInQueue) {
                return null;
            }

            await nextInQueue.update({ status: 'ACTIVE' });
            await this.notifyPromoted(nextInQueue.createcall.chatId);
            await this.updateRemainingQueue();

            // Emit queue update event
            if (this.io) {
                this.io.emit('queueUpdate', {
                    chatId: nextInQueue.createcall.chatId,
                    position: 0,
                    isPromoted: true
                });
            }

            return nextInQueue;
        } catch (error) {
            console.error('Erro ao promover próximo da fila:', error);
            throw error;
        }
    }

    async updateRemainingQueue() {
        try {
            const waitingCalls = await Call.findAll({
                where: { status: 'WAITING' },
                include: [{
                    model: CreateCall,
                    as: 'createcall'
                }],
                order: [['createCallId', 'ASC']]
            });

            // Notifica cada usuário na fila sobre sua nova posição
            const notifications = waitingCalls.map(async (call, index) => {
                const position = index + 1;
                await this.notifyQueuePosition(
                    call.createcall.chatId, 
                    position,
                    false
                );
            });

            await Promise.all(notifications);

            if (this.io) {
                this.io.emit('queueUpdated', {
                    waitingCount: waitingCalls.length
                });
            }
        } catch (error) {
            console.error('Erro ao atualizar fila:', error);
        }
    }

    async notifyQueuePosition(chatId, position, isFirstNotification = false) {
        if (!this.botConnection) {
            console.error('Conexão do bot não disponível para enviar mensagem');
            return;
        }

        try {
            const message = isFirstNotification ? 
                greetings.queueFirstNotification.replace('%d', position) :
                greetings.queueUpdate.replace('%d', position);

            console.log(`Enviando mensagem para ${chatId}: ${message}`); 

            await this.botConnection.client.sendMessage({
                to: chatId,
                body: message,
                options: { type: 'sendText' }
            });
        } catch (error) {
            console.error('Erro ao notificar posição:', error, {
                chatId,
                position,
                isFirstNotification,
                hasConnection: !!this.botConnection
            });
        }
    }

    async notifyPromoted(chatId) {
        if (!this.botConnection) {
            console.error('Conexão do bot não disponível para enviar mensagem');
            return;
        }

        try {
            console.log(`Notificando promoção para ${chatId}`); // Log para debug

            await this.botConnection.client.sendMessage({
                to: chatId,
                body: greetings.nextInLine,
                options: { type: 'sendText' }
            });
        } catch (error) {
            console.error('Erro ao notificar promoção:', error, {
                chatId,
                hasConnection: !!this.botConnection
            });
        }
    }

    setBotConnection(connection) {
        if (!connection || !connection.client) {
            console.error('Tentativa de definir conexão inválida');
            return;
        }
        console.log('Atualizando conexão do bot no QueueManager');
        this.botConnection = connection;
    }
}

module.exports = QueueManager;

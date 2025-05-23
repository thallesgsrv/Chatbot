const Call = require('../../models/entities/call.js');
const CreateCall = require('../../models/entities/createcall.js');
const greetings = require('../messages/greetings.json');
const User = require('../../models/entities/user.js');

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

            console.log(`Chats ativos: ${activeCount}, máximo permitido: ${this.maxActiveChats}`);

            const nextInQueue = await Call.findOne({
                where: { 
                    status: 'WAITING',
                    dateTimeFinish: null 
                },
                include: [{
                    model: CreateCall,
                    as: 'createcall',
                    include: [{
                        model: User,
                        as: 'user'
                    }]
                }],
                order: [['createCallId', 'ASC']]
            });

            if (!nextInQueue) {
                console.log('Nenhum usuário na fila de espera');
                return null;
            }

            console.log(`Promovendo call ${nextInQueue.id} (${nextInQueue.createcall.chatId}) para ACTIVE`);

            // Atualizar status para ACTIVE
            await Call.update(
                { status: 'ACTIVE' },
                { where: { id: nextInQueue.id } }
            );

            // Notificar o usuário promovido
            if (this.botConnection && nextInQueue.createcall) {
                const nextChatId = nextInQueue.createcall.chatId.includes('@c.us') 
                    ? nextInQueue.createcall.chatId 
                    : `${nextInQueue.createcall.chatId}@c.us`;

                // Formatar nome do usuário
                const formatName = (name) => {
                    if (!name) return '';
                    return name.split(' ')
                        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                        .join(' ');
                };

                try {
                    const userName = formatName(nextInQueue.createcall.user?.name || '');
                    
                    // Enviar apenas uma mensagem - remover chamada do notifyPromoted
                    await this.botConnection.client.sendMessage({
                        to: nextChatId,
                        body: greetings.nextInLine.replace('%s', userName || ''),
                        options: { type: 'sendText' }
                    });

                    // Atualizar UI
                    if (this.io) {
                        this.io.emit('queueUpdate', {
                            chatId: nextInQueue.createcall.chatId,
                            position: 0,
                            isPromoted: true
                        });
                        this.io.emit('statusUpdate');
                        this.io.emit('forceUpdate');
                    }

                    await this.updateRemainingQueue();
                } catch (error) {
                    console.error('Erro ao enviar mensagens:', error);
                }
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

            console.log(`Atualizando ${waitingCalls.length} usuários na fila`);

            // Notificar cada usuário na fila sobre sua nova posição
            for (let index = 0; index < waitingCalls.length; index++) {
                const call = waitingCalls[index];
                const position = index + 1;
                
                if (call.createcall && this.botConnection) {
                    try {
                        await this.notifyQueuePosition(
                            call.createcall.chatId,
                            position,
                            false
                        );
                        console.log(`Notificado ${call.createcall.chatId} - posição ${position}`);
                    } catch (error) {
                        console.error(`Erro ao notificar ${call.createcall.chatId}:`, error);
                    }
                }
            }

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
        if (!this.botConnection || !this.botConnection.client) {
            console.error('Conexão do bot não disponível para notificar posição');
            return;
        }

        try {
            const message = isFirstNotification ? 
                greetings.queueFirstNotification.replace('%d', position) :
                greetings.queueUpdate.replace('%d', position);

            await this.botConnection.client.sendMessage({
                to: chatId,
                body: message,
                options: { type: 'sendText' }
            });
            
            // Aguarda um pequeno intervalo para evitar flood de mensagens
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error('Erro ao notificar posição:', error);
            throw error;
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

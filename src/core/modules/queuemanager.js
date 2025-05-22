const Call = require('../../models/entities/call.js');
const CreateCall = require('../../models/entities/createcall.js');
const greetings = require('../messages/greetings.json');

class QueueManager {
    constructor(io, botConnection, config) {
        this.io = io;
        this.botConnection = botConnection;
        this.maxActiveChats = config.MAX_ACTIVE_CHATS || 3;
    }

    async checkQueueStatus(chatId) {
        const activeCount = await Call.count({ 
            where: { status: 'ACTIVE' } 
        });
        return {
            shouldQueue: activeCount >= this.maxActiveChats,
            position: activeCount >= this.maxActiveChats ? 
                await this.getQueuePosition(chatId) : 0
        };
    }

    async getQueuePosition(chatId) {
        try {
            const waitingCalls = await Call.findAll({
                where: { status: 'WAITING' },
                include: [{
                    model: CreateCall,
                    as: 'createcall'
                }],
                order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'ASC']]
            });

            return waitingCalls.findIndex(
                call => call.createcall && call.createcall.chatId === chatId
            ) + 1 || waitingCalls.length + 1;
        } catch (error) {
            console.error('Erro ao calcular posição na fila:', error);
            return 1;
        }
    }

    async addToQueue(call) {
        try {
            await call.update({ status: 'WAITING' });
            const position = await this.getQueuePosition(call.createcall.chatId);
            await this.notifyQueuePosition(call.createcall.chatId, position);
            this.io.emit('statusUpdate');
            return position;
        } catch (error) {
            console.error('Erro ao adicionar à fila:', error);
            throw error;
        }
    }

    async promoteNextInQueue() {
        try {
            const nextInQueue = await Call.findOne({
                where: { status: 'WAITING' },
                include: [{
                    model: CreateCall,
                    as: 'createcall'
                }],
                order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'ASC']]
            });

            if (nextInQueue) {
                await nextInQueue.update({ status: 'ACTIVE' });
                await this.notifyPromoted(nextInQueue.createcall.chatId);
                await this.updateRemainingQueue();
                this.io.emit('statusUpdate');
                return nextInQueue;
            }
            return null;
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
                order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'ASC']]
            });

            for (let i = 0; i < waitingCalls.length; i++) {
                const call = waitingCalls[i];
                await this.notifyQueuePosition(
                    call.createcall.chatId, 
                    i + 1
                );
            }
        } catch (error) {
            console.error('Erro ao atualizar fila:', error);
        }
    }

    async notifyQueuePosition(chatId, position) {
        if (this.botConnection) {
            try {
                await this.botConnection.client.sendMessage({
                    to: chatId,
                    body: greetings.queueUpdate
                        .replace('%d', position),
                    options: { type: 'sendText' }
                });
            } catch (error) {
                console.error('Erro ao notificar posição:', error);
            }
        }
    }

    async notifyPromoted(chatId) {
        if (this.botConnection) {
            try {
                await this.botConnection.client.sendMessage({
                    to: chatId,
                    body: greetings.nextInLine,
                    options: { type: 'sendText' }
                });
            } catch (error) {
                console.error('Erro ao notificar promoção:', error);
            }
        }
    }

    setBotConnection(connection) {
        this.botConnection = connection;
    }
}

module.exports = QueueManager;

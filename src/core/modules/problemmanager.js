const Call = require('../../models/entities/call.js');
const User = require('../../models/entities/user.js');
const School = require('../../models/entities/school.js');
const CreateCall = require('../../models/entities/createcall.js');
const Attendant = require('../../models/entities/attendant.js');
const dialogs = require('../messages/dialogs.json');
const errors = require('../messages/errors.json');
const finished = require('../messages/finished.json');
const commands = require('../messages/commands.json');
const greetings = require('../messages/greetings.json');

const PROBLEM_MAPPINGS = require('../messages/problemMappings.json');
const Card = require('../../models/entities/card.js');

class ProblemManager {
    constructor(io, botConnection, screening, sharedState) {
        this.io = io;
        this.botConnection = botConnection;
        this.screening = screening; 
        this.userCurrentTopic = {};
        this.sharedState = sharedState;
    }

    setBotConnection(connection) {
        this.botConnection = connection;
    }

    async sendProblemOptions(conn, chatId) {
        await this.sendMessage(conn, chatId, dialogs.problemOptions);
    }

    
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async handleProblemSelection(conn, chatId, messageText) {
        const normalizedText = String(messageText).trim();

        // Primeiro, verifica se é um número válido de opção
        if (["1", "2", "3", "4", "5", "6"].includes(normalizedText)) {
            if (normalizedText === "5") {
                await this.sendMessage(conn, chatId, dialogs.rfaceContact);
                await this.handleChatEnd(conn, chatId, null, true);
                delete this.userCurrentTopic[chatId];
                return;
            }
            
            if (normalizedText === "6") {
                await this.sendMessage(conn, chatId, dialogs.describeIssue);
                await this.delay(4000);
                this.userCurrentTopic[chatId] = { 
                    state: 'descricaoProblema',
                    type: 'custom'
                };
                return;
            }

            const problem = commands.problemMapping[normalizedText];
            if (!problem) {
                await this.sendMessage(conn, chatId, errors.invalidOption);
                // Reenvia as opções de problema
                await this.sendProblemOptions(conn, chatId);
                this.userCurrentTopic[chatId] = 'problema';
                return;
            }

            const subProblems = this.getSubProblemOptions(problem);
            if (subProblems && subProblems !== errors.invalidOption) {
                await this.sendMessage(conn, chatId, subProblems);
                this.userCurrentTopic[chatId] = { problem, stage: 'subproblema' };
            } else {
                await this.sendMessage(conn, chatId, errors.invalidOption);
                await this.sendProblemOptions(conn, chatId);
                this.userCurrentTopic[chatId] = 'problema';
            }
            return;
        }

        if (normalizedText === commands.backCommand) {
            await this.sendProblemOptions(conn, chatId);
            this.userCurrentTopic[chatId] = 'problema';
            return;
        }

        // Se chegou aqui, é uma opção inválida
        await this.sendMessage(conn, chatId, errors.invalidOption);
        await this.sendProblemOptions(conn, chatId);
        this.userCurrentTopic[chatId] = 'problema';
    }

    async handleVideoFeedback(conn, chatId, messageText) {
        try {
            const topic = this.userCurrentTopic[chatId];
            if (!topic || topic.state !== 'awaitingFeedback') {
                return;
            }

            const response = messageText.toLowerCase();
            if (response === 'sim' || response === 's') {
                const createCall = await CreateCall.findOne({
                    where: { chatId },
                    order: [['date', 'DESC']]
                });

                if (createCall) {
                    const call = await Call.findOne({
                        where: { createCallId: createCall.id }
                    });

                    if (call) {
                        await call.update({ status: 'COMPLETED' });
                        
                        // Send success message
                        await this.sendMessage(conn, chatId, finished.helpfulVideo);
                        await this.sendMessage(conn, chatId, finished.feedbackRequest);
                        
                        // Update topic to await service rating
                        this.userCurrentTopic[chatId] = {
                            state: 'awaitingRating',
                            callId: call.id
                        };
                    }
                }
            } else if (response === 'não' || response === 'nao' || response === 'n') {
                // Change topic state to request detailed description
                await this.sendMessage(conn, chatId, dialogs.feedbackNegative);
                await this.sendMessage(conn, chatId, dialogs.describeIssue);
                this.userCurrentTopic[chatId] = { 
                    state: 'descricaoProblema',
                    type: 'videoFeedback',
                    problem: topic.problem,
                    subProblem: topic.subProblem,
                    videoAttempted: true
                };
            } else {
                await this.sendMessage(conn, chatId, errors.invalidOption);
                await this.sendMessage(conn, chatId, dialogs.videoFeedback);
            }
        } catch (error) {
            console.error('Erro em handleVideoFeedback:', error);
            await this.sendMessage(conn, chatId, errors.tryAgainLater);
        }
    }

    async handleRating(conn, chatId, messageText) {
        try {
            const topic = this.userCurrentTopic[chatId];
            if (!topic || topic.state !== 'awaitingRating') {
                return;
            }

            const rating = parseInt(messageText);
            if (isNaN(rating) || rating < 1 || rating > 5) {
                await this.sendMessage(conn, chatId, finished.feedbackInvalid);
                return;
            }

            const call = await Call.findOne({
                where: { id: topic.callId }
            });

            if (call) {
                await call.update({
                    rating,
                    status: 'COMPLETED',
                    dateTimeFinish: new Date()
                });
                
                await this.sendMessage(conn, chatId, finished.feedbackThank);
                await this.sendMessage(conn, chatId, finished.chatCompleted);
                
                // Single event emission with all data
                this.io.emit('chatEnded', { 
                    chatId,
                    callId: call.id,
                    type: 'completed'
                });
                
                delete this.userCurrentTopic[chatId];
                this.sharedState.removeChatFromHumanAttended(chatId);
            }
        } catch (error) {
            console.error('Erro em handleRating:', error);
            await this.sendMessage(conn, chatId, errors.tryAgainLater);
            delete this.userCurrentTopic[chatId];
        }
    }

    async handleCustomProblem(conn, chatId, description) {
        try {
            const createCall = await CreateCall.findOne({
                where: { chatId },
                include: [
                    {
                        model: User,
                        as: 'user',
                        include: [School]
                    }
                ],
                order: [['date', 'DESC']]
            });

            if (!createCall) {
                throw new Error('CreateCall não encontrado');
            }

            const existingCall = await Call.findOne({
                where: { createCallId: createCall.id }
            });

            if (!existingCall) {
                throw new Error('Call não encontrado');
            }

            const topic = this.userCurrentTopic[chatId];
            let problemDescription;

            if (topic.type === 'videoFeedback') {
                // Quando vem do feedback negativo do vídeo
                problemDescription = `${description}`;
                            
            } else {
                // Se é opção 6
                problemDescription = `${description}`;
            }
            
            await existingCall.update({
                description: problemDescription,
                status: 'PENDING'
            });

            // Mark as human attended before sending message
            this.markChatAsHumanAttended(chatId);
            
            await this.sendMessage(conn, chatId, greetings.attendantAssigned);
            
            this.io.emit('userProblem', {
                description: problemDescription,
                chatId,
                name: createCall.user?.name || '',
                city: createCall.user?.school?.client || '',
                position: createCall.user?.type || '',
                school: createCall.user?.school?.name || ''
            });

            if (this.screening) {
                this.screening.clearUserTopic(chatId);
            }
            
        } catch (error) {
            console.error('Erro em handleCustomProblem:', error);
            await this.sendMessage(conn, chatId, errors.tryAgainLater);
        }
    }

    async sendSubProblemOptions(conn, chatId, problem) {
        const subProblemOptions = this.getSubProblemOptions(problem);
        await this.sendMessage(conn, chatId, subProblemOptions);
    }

    getSubProblemOptions(problem) {
       
        console.log('Getting subproblems for:', problem);
        console.log('Available mappings:', PROBLEM_MAPPINGS);
        
        const key = PROBLEM_MAPPINGS[problem];
        console.log('Mapped key:', key);
        console.log('Available subProblems:', dialogs.subProblems);
        
        if (key && dialogs.subProblems[key]) {
            return dialogs.subProblems[key].title;
        }
        return errors.invalidOption;
    }

    async handleSubProblemSelection(conn, chatId, messageText) {
        try {
            if (messageText === commands.backCommand) {
                this.userCurrentTopic[chatId] = 'problema';
                await this.sendProblemOptions(conn, chatId);
                return;
            }

            const mainProblem = this.userCurrentTopic[chatId]?.problem;
            const problemKey = PROBLEM_MAPPINGS[mainProblem];

            // Verify subproblem options exist
            if (!problemKey || !dialogs.subProblems[problemKey]) {
                console.error('Invalid problem key:', { problemKey, mainProblem });
                await this.sendMessage(conn, chatId, errors.invalidOption);
                return;
            }

            const subProblemOptions = dialogs.subProblems[problemKey].options;
            if (!subProblemOptions[messageText]) {
                console.error('Invalid subproblem option:', messageText);
                await this.sendMessage(conn, chatId, errors.invalidOption);
                return;
            }

            const subProblemText = subProblemOptions[messageText];
            const videoUrl = dialogs.subProblems[problemKey].videos?.[messageText];

            // Find the call with proper associations
            const createCall = await CreateCall.findOne({
                where: { chatId },
                include: [
                    {
                        model: User,
                        as: 'user',
                        include: [School]
                    }
                ],
                order: [['date', 'DESC']]
            });

            if (!createCall) {
                throw new Error('CreateCall não encontrado');
            }

            // Find associated call
            const existingCall = await Call.findOne({
                where: { createCallId: createCall.id }
            });

            if (!existingCall) {
                throw new Error('Call não encontrado');
            }

            const problemDescription = `${mainProblem} - ${subProblemText}`;
            
            await existingCall.update({
                description: problemDescription
                // NÃO altera status para PENDING aqui!
            });

            // Send video tutorial if available
            if (videoUrl) {
                await this.sendMessage(conn, chatId, dialogs.watchVideo.replace('%s', videoUrl));
                await this.sendMessage(conn, chatId, dialogs.videoFeedback);
                this.userCurrentTopic[chatId] = { 
                    state: 'awaitingFeedback',
                    problem: mainProblem,
                    subProblem: subProblemText
                };
            } else {
                await this.sendMessage(conn, chatId, dialogs.problemRegistered);
                delete this.userCurrentTopic[chatId];
            }

        } catch (error) {
            console.error('Erro em handleSubProblemSelection:', error);
            await this.sendMessage(conn, chatId, errors.tryAgainLater);
        }
    }

    async sendMessage(conn, chatId, message) {
        try {
            await this.delay(2000); // Delay before sending message
            await conn.client.sendMessage({
                to: chatId,
                body: message,
                options: { type: 'sendText' }
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    }

    getUserTopic(chatId) {
        return this.userCurrentTopic[chatId];
    }

    setUserTopic(chatId, topic) {
        this.userCurrentTopic[chatId] = topic;
    }

    clearUserTopic(chatId) {
        delete this.userCurrentTopic[chatId];
    }

    // Replace existing isHumanAttended method
    isHumanAttended(chatId) {
        return this.sharedState.isHumanAttended(chatId);
    }

    // Replace existing markChatAsHumanAttended method
    markChatAsHumanAttended(chatId, isForwarded = false) {
        this.sharedState.markChatAsHumanAttended(chatId);
        delete this.userCurrentTopic[chatId];
        
        if (this.screening && !isForwarded) {
            this.screening.markChatAsHumanAttended(chatId, true);
        }
    }

    // Replace shouldProcessMessage method
    shouldProcessMessage(chatId) {
        const topic = this.userCurrentTopic[chatId];
        if (topic && topic.state === 'descricaoProblema') {
            return true;
        }
        return !this.sharedState.isHumanAttended(chatId);
    }
    
    // Modificar handleUserMessage para verificar antes de processar
    async handleMessage(conn, chatId, messageText) {
        if (!this.shouldProcessMessage(chatId)) {
            return; 
        }

        const topic = this.userCurrentTopic[chatId];
        
        // Verifica se o usuário está no estado de descrição do problema
        if (topic && topic.state === 'descricaoProblema') {
            await this.handleCustomProblem(conn, chatId, messageText);
            return;
        }

        // Verifica outros estados
        if (topic && topic.state === 'awaitingFeedback') {
            await this.handleVideoFeedback(conn, chatId, messageText);
            return;
        }

        if (topic && topic.state === 'awaitingRating') {
            await this.handleRating(conn, chatId, messageText);
            return;
        }

        // Roteamento padrão baseado no estágio do tópico
        if (!topic || topic === 'problema') {
            await this.handleProblemSelection(conn, chatId, messageText);
        } else if (topic.stage === 'subproblema') {
            await this.handleSubProblemSelection(conn, chatId, messageText);
        }
    }

    setScreening(screening) {
        this.screening = screening;
    }

    async handleProblemAttendance(conn, problem, attendantName) {
        try {
            console.log('Iniciando atendimento para:', problem);

            // Procurar ou criar o atendente
            const [attendant] = await Attendant.findOrCreate({
                where: { name: attendantName }
            });

            // Buscar o createCall mais recente para este chatId
            const createCall = await CreateCall.findOne({
                where: { chatId: problem.chatId },
                order: [['date', 'DESC']]
            });

            if (!createCall) {
                throw new Error('CreateCall não encontrado');
            }

            // Buscar e atualizar o call
            const call = await Call.findOne({
                where: { createCallId: createCall.id }
            });

            if (call) {
                await call.update({
                    attendantId: attendant.id,
                    startDate: new Date()
                });
            }

            // Marcar chat como atendido por humano
            this.markChatAsHumanAttended(problem.chatId);

            // Enviar mensagem de introdução do atendente
            if (conn) {
                let whatsappId = problem.chatId;
                if (!whatsappId.includes('@')) {
                    whatsappId = `${whatsappId}@c.us`;
                }
                
                await conn.client.sendMessage({
                    to: whatsappId,
                    body: greetings.attendantIntroduction.replace('%s', attendantName),
                    options: { type: 'sendText' }
                });
            }

            // Emitir evento de problema atendido
            this.io.emit('problemAttended', {
                chatId: problem.chatId,
                attendantName: attendantName
            });

            // Atualizar status geral
            this.io.emit('statusUpdate');

        } catch (error) {
            console.error('Erro ao atender problema:', error);
            throw error;
        }
    }

    async handleChatEnd(conn, chatId, cardData = null, skipFeedback = false) {
        try {
            const createCall = await CreateCall.findOne({
                where: { chatId },
                order: [['date', 'DESC']]
            });

            if (!createCall) {
                throw new Error('CreateCall não encontrado');
            }

            const call = await Call.findOne({
                where: { createCallId: createCall.id }
            });

            if (call) {
                await call.update({
                    status: 'COMPLETED',
                    dateTimeFinish: new Date()
                });

                delete this.userCurrentTopic[chatId];
                this.sharedState.removeChatFromHumanAttended(chatId);

                if (conn && !skipFeedback) {
                    await this.sendMessage(conn, chatId, finished.helpfulMessage);
                    await this.sendMessage(conn, chatId, finished.feedbackRequest);
                    this.userCurrentTopic[chatId] = {
                        state: 'awaitingRating',
                        callId: call.id
                    };
                }

                // Single event emission with all data
                this.io.emit('chatEnded', { 
                    chatId,
                    callId: call.id,
                    skipFeedback,
                    type: skipFeedback ? 'completed' : 'awaitingFeedback'
                });
            }
        } catch (error) {
            console.error('Erro ao finalizar chat:', error);
            throw error;
        }
    }
}



module.exports = ProblemManager;



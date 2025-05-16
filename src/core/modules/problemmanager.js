const Call = require('../../models/entities/call.js');
const User = require('../../models/entities/user.js');
const School = require('../../models/entities/school.js');
const CreateCall = require('../../models/entities/createcall.js');
const dialogs = require('../messages/dialogs.json');
const errors = require('../messages/errors.json');
const finished = require('../messages/finished.json');
const commands = require('../messages/commands.json');

const PROBLEM_MAPPINGS = require('../messages/problemMappings.json');

class ProblemManager {
    constructor(io, botConnection) {
        this.io = io;
        this.botConnection = botConnection;
        this.userCurrentTopic = {};
    }

    setBotConnection(connection) {
        this.botConnection = connection;
    }

    async sendProblemOptions(conn, chatId) {
        await this.sendMessage(conn, chatId, dialogs.problemOptions);
    }

    async handleProblemSelection(conn, chatId, messageText) {
        const normalizedText = String(messageText).trim();
        
        // Log para debug
        console.log('Received problem selection:', normalizedText);
        console.log('Available mappings:', commands.problemMapping);

        // Primeiro, verifica se é um número válido de opção
        if (["1", "2", "3", "4", "5", "6"].includes(normalizedText)) {
            if (normalizedText === "5") {
                await this.sendMessage(conn, chatId, dialogs.rfaceContact);
                delete this.userCurrentTopic[chatId];
                this.io.emit('endChat', { chatId });
                return;
            }
            
            if (normalizedText === "6") {
                await this.sendMessage(conn, chatId, dialogs.describeIssue);
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

            // Update call with rating and completion time
            const call = await Call.findOne({
                where: { id: topic.callId }
            });

            if (call) {
                await call.update({
                    rating,
                    status: 'COMPLETED',
                    dateTimeFinish: new Date()
                });
                
                // Send thank you message and end chat
                await this.sendMessage(conn, chatId, finished.feedbackThank);
                await this.sendMessage(conn, chatId, finished.chatCompleted);
                
                // Emit end chat event
                this.io.emit('endChat', { chatId });
                this.io.emit('statusUpdate');
                
                // Clear user topic
                delete this.userCurrentTopic[chatId];
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
                problemDescription = `${topic.problem} - ${topic.subProblem}\n` +
                                  `Tutorial não resolveu o problema\n` +
                                  `Detalhes adicionais: ${description}`;
            } else {
                // Se é opção 6
                problemDescription = `Descrição detalhada do problema: ${description}`;
            }
            
            await existingCall.update({
                description: problemDescription,
                status: 'PENDING'
            });

            this.io.emit('userProblem', {
                description: problemDescription,
                chatId,
                name: createCall.user?.name || '',
                city: createCall.user?.school?.client || '',
                position: createCall.user?.type || '',
                school: createCall.user?.school?.name || ''
            });

            await this.sendMessage(conn, chatId, dialogs.problemRegistered);
            delete this.userCurrentTopic[chatId];

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

            // Emit problem update
            this.io.emit('userProblem', {
                description: problemDescription,
                chatId,
                name: createCall.user?.name || '',
                city: createCall.user?.school?.client || '',
                position: createCall.user?.type || '',
                school: createCall.user?.school?.name || ''
            });

        } catch (error) {
            console.error('Erro em handleSubProblemSelection:', error);
            await this.sendMessage(conn, chatId, errors.tryAgainLater);
        }
    }

    async sendMessage(conn, chatId, message) {
        try {
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
}

module.exports = ProblemManager;



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
        switch (messageText) {
            case '1':
            case '2':
            case '3':
            case '4': {
                const problem = commands.problemMapping[messageText];
                await this.sendSubProblemOptions(conn, chatId, problem);
                this.userCurrentTopic[chatId] = { problem, stage: 'subproblema' };
                break;
            }
            case '5':
                await this.sendMessage(conn, chatId, dialogs.rfaceContact);
                delete this.userCurrentTopic[chatId];
                this.io.emit('endChat', { chatId });
                await this.closeChat(chatId);
                break;
            case '6':
                await this.sendMessage(conn, chatId, dialogs.describeIssue);
                this.userCurrentTopic[chatId] = { 
                    state: 'descricaoProblema',
                    type: 'custom'
                };
                break;
            case commands.backCommand:
                await this.sendProblemOptions(conn, chatId);
                break;
            default:
                await this.sendMessage(conn, chatId, errors.invalidOption);
        }
    }

    async sendSubProblemOptions(conn, chatId, problem) {
        const subProblemOptions = this.getSubProblemOptions(problem);
        await this.sendMessage(conn, chatId, subProblemOptions);
    }

    getSubProblemOptions(problem) {
        const key = PROBLEM_MAPPINGS[problem];
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

            const mainProblem = this.userCurrentTopic[chatId].problem;
            const problemKey = PROBLEM_MAPPINGS[mainProblem];

            if (!problemKey || !dialogs.subProblems[problemKey]?.options[messageText]) {
                await this.sendMessage(conn, chatId, errors.invalidOption);
                return;
            }

            const subProblemText = dialogs.subProblems[problemKey].options[messageText];
            const videoUrl = dialogs.subProblems[problemKey].videos[messageText];

            const existingCall = await Call.findOne({
                include: [{
                    model: CreateCall,
                    as: 'createcall',
                    where: { chatId },
                    include: [{
                        model: User,
                        as: 'user',
                        include: [School]
                    }]
                }],
                order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'DESC']]
            });

            if (!existingCall) {
                throw new Error('Call não encontrado');
            }

            const problemDescription = `${mainProblem} - ${subProblemText}`;
            
            await existingCall.update({
                description: problemDescription,
                status: 'PENDING'
            });

            await this.sendMessage(conn, chatId, dialogs.watchVideo.replace('%s', videoUrl));
            await this.sendMessage(conn, chatId, dialogs.videoFeedback);
            this.userCurrentTopic[chatId] = 'videoFeedback';

            this.io.emit('userProblem', {
                description: problemDescription,
                chatId,
                name: existingCall.createcall?.user?.name || '',
                city: existingCall.createcall?.user?.school?.client || '',
                position: existingCall.createcall?.user?.type || '',
                school: existingCall.createcall?.user?.school?.name || ''
            });

            await this.sendStatusUpdateToMainProcess();

        } catch (error) {
            console.error('Erro em handleSubProblemSelection:', error);
            await this.sendMessage(conn, chatId, errors.tryAgainLater);
            this.userCurrentTopic[chatId] = 'problema';
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

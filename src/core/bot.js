/**
 * Bot de atendimento automatizado com integração WhatsApp
 * Responsável por gerenciar filas, mensagens e interações com usuários
 */

const hydraBot = require('hydra-bot');
const path = require('path');
const { ipcMain } = require('electron');
const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { handleRecovery } = require('./recovery.js'); 
const { getRecentContacts } = require('./contacts/getcontacts.js');
const ServiceFeedback = require('./modules/serviceFeedback');
const Screening = require('./modules/screening');

// Import Sequelize models
const Call = require('../models/entities/call');
const User = require('../models/entities/user');
const School = require('../models/entities/school');
const CreateCall = require('../models/entities/createcall');
const Card = require('../models/entities/card');
const Attendant = require('../models/entities/attendant');
const sequelize = require('../models/connections/connection');

//Importar mensagens e diálogos                                            
const greetings = require('./messages/greetings.json');
const dialogs = require('./messages/dialogs.json');
const errors = require('./messages/errors.json');
const finished = require('./messages/finished.json');
const commands = require('./messages/commands.json');
const logs = require('./messages/logs.json');

//Caminhos de recursos
const assetsPath = path.join(__dirname, '../assets');

const PROBLEM_MAPPINGS = require('./messages/problemMappings.json');

/**
 * Configurações globais do sistema
 */
const CONFIG = {
    MESSAGE_DELAY: 1500, 
    MAX_ACTIVE_CHATS: 3,
    MESSAGE_HISTORY_LIMIT: 50,
    DUPLICATE_MESSAGE_WINDOW: 30000,
    DEFAULT_HEADLESS: false
};

const RESPONSE_DELAY = {
    MIN: 30000, // 30 segundos
    MAX: 120000 // 120 segundos
};

/**
 * Estado global da aplicação
 * bot: Instância principal do bot
 * botConnection: Conexão atual com o WhatsApp
 * messageQueue: Fila de mensagens para garantir ordem de envio
 * isProcessingQueue: Flag de controle do processamento da fila
 * userCurrentTopic: Registro dos tópicos atuais de cada usuário
 * humanAttendedChats: Conjunto de chats em atendimento humano
 */
let bot;
let botConnection = null;
const messageQueue = new Map();
let isProcessingQueue = false;
let userCurrentTopic = {};
let humanAttendedChats = new Set();
const messageHistory = new Map();

// Add these two new declarations
const processedEvents = new Set();
const EVENT_TIMEOUT = 2000; 

// Initialize Screening instance
let screening;

/**
 * Template de boas-vindas e coleta de informações
 * Solicita dados básicos do usuário para início do atendimento
 */
const defaultMessage = greetings.welcome;

// Inicializar Express
const server = express();

// Adicionar middleware JSON
server.use(express.json());

/**
 * Inicializa o servidor do bot e configura eventos principais
 * @param {Object} io - Instância do Socket.IO para comunicação em tempo real
 */
async function startHydraBot(io) {
    try {
        bot = await hydraBot.initServer({
            puppeteerOptions: {
                headless: CONFIG.DEFAULT_HEADLESS,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            }
        });

        console.log('Bot initialized successfully');
        

        screening = new Screening(io, getStatusUpdate); 
        
       
        bot.on('connection', async (conn) => {
            if (conn.connect) {
                console.log(logs.connectionEstablished);
                conn.io = io; 
                botConnection = conn;
                startListeningForMessages(conn, io);
            } else {
                console.error(errors.connectionError);
            }
        });

        setupIpcListeners(io);
        setupSocketListeners(io);
    } catch (error) {
        console.error(errors.connectionError);
    }
}

/**
 * Configura os event listeners principais
 * @param {Object} io - Instância do Socket.IO para comunicação em tempo real
 */
function setupEventListeners(io) {
    setupIpcListeners(io);
    setupSocketListeners(io);
}

function setupIpcListeners(io) {
    // Listener para redirecionamento de chat
    ipcMain.on('redirectToChat', (event, chatId) => {
        redirectToWhatsAppChat(chatId);
    });

    // Listener para envio de mensagem
    ipcMain.on('sendMessage', async (event, { chatId, message }) => {
        if (botConnection) {
            try {
                await sendMessage(botConnection, chatId, message);
            } catch (error) {
                console.error(errors.sendError.replace('%s', error));
            }
        }
    });
}

function setupSocketListeners(io) {
    console.log(logs.socketConfigured);
    
    io.on('connection', (socket) => {
        socket.on('createCard', async (data) => {
            try {
                console.log('Recebendo solicitação de criação de card:', data);
                const { chatId, cardLink } = data;
                
                const card = await Card.create({
                    chatId,
                    cardLink,
                    cardStatus: 'PENDING'
                });

                console.log('Card criado com sucesso:', card);
                io.emit('cardCreated', card);
            } catch (error) {
                console.error('Erro ao processar criação do card:', error);
                socket.emit('cardError', { error: 'Erro interno do servidor' });
            }
        });

        socket.on('cardUpdated', async (card) => {
            try {
                io.emit('cardUpdated', card);
            } catch (error) {
                console.error('Erro ao atualizar card:', error);
            }
        });

        socket.on('endChat', async (data) => {
            try {
                const { chatId, id, requestFeedback } = data;
                
                const eventId = `end_${chatId}_${Date.now()}`;
                if (processedEvents.has(eventId)) return;
                
                processedEvents.add(eventId);
                setTimeout(() => processedEvents.delete(eventId), EVENT_TIMEOUT);

                humanAttendedChats.delete(chatId);

                await Call.update(
                    { status: 'COMPLETED', dateTimeFinish: new Date() },
                    { where: { chatId, id } }
                );

                const statusData = await getStatusUpdate();
                io.emit('statusUpdate', statusData);
                io.emit('chatCompleted', { chatId });

                delete userCurrentTopic[chatId];

                if (requestFeedback && botConnection && !userCurrentTopic[chatId]) {
                    setTimeout(async () => {
                        await ServiceFeedback.requestFeedback(botConnection, chatId);
                        userCurrentTopic[chatId] = 'serviceFeedback';
                    }, 500);
                }

            } catch (error) {
                console.error(errors.processError.replace('%s', error));
            }
        });
    });
}

// Ouvir mensagens recebidas
async function startListeningForMessages(conn, io) {
    const processedMessageIds = new Set();
    const MESSAGE_EXPIRY = 60000;

    conn.client.ev.on('newMessage', async (newMsg) => {
        const chatId = newMsg.result.chatId;
        const messageId = newMsg.result.id || `${chatId}_${Date.now()}`;

        // Verificar se a mensagem já foi processada
        if (processedMessageIds.has(messageId)) {
            console.log(logs.processedMessage.replace('%s', messageId));
            return;
        }

        // Adicionar mensagem ao controle
        processedMessageIds.add(messageId);
        setTimeout(() => processedMessageIds.delete(messageId), MESSAGE_EXPIRY);

        try {
            // Ignorar mensagens enviadas pelo bot
            if (newMsg.result.fromMe || chatId.endsWith('@g.us')) {
                return;
            }

            const messageText = newMsg.result.body.toLowerCase();

            // Verificar se é recuperação de senha
            const recoveryResponse = await handleRecovery(newMsg.result);
            if (recoveryResponse) {
                await sendMessage(conn, chatId, recoveryResponse);
                return;
            }

            // Verificar se já está em processo de triagem
            const screeningTopic = screening.getUserTopic(chatId);
            
            // Se não está em triagem e não tem tópico atual, iniciar triagem
            if (!screeningTopic && !userCurrentTopic[chatId]) {
                await screening.startScreening(conn, chatId);
                return;
            }

            // Se está em triagem, processar conforme o estado
            if (screeningTopic) {
                switch (screeningTopic.state) {
                    case 'awaitingCpf':
                        await screening.handleCpfInput(conn, chatId, messageText, io);
                        return;
                    case 'awaitingTypeSelection':
                        const typeIndex = parseInt(messageText) - 1;
                        if (isNaN(typeIndex) || typeIndex < 0 || typeIndex >= screeningTopic.types.length) {
                            await sendMessage(conn, chatId, errors.invalidOption);
                            return;
                        }
                        await screening.handleTypeSelection(conn, chatId, typeIndex, screeningTopic.types, screeningTopic.schoolsByTypeCity);
                        return;
                    case 'awaitingCitySelection':
                        const cityIndex = parseInt(messageText) - 1;
                        if (isNaN(cityIndex) || cityIndex < 0 || cityIndex >= screeningTopic.cities.length) {
                            await sendMessage(conn, chatId, errors.invalidOption);
                            return;
                        }
                        await screening.handleCitySelection(conn, chatId, cityIndex, screeningTopic.cities, screeningTopic.type);
                        return;
                    case 'awaitingSchoolSelection':
                        const schoolIndex = parseInt(messageText) - 1;
                        if (isNaN(schoolIndex) || schoolIndex < 0 || schoolIndex >= screeningTopic.schools.length) {
                            await sendMessage(conn, chatId, errors.invalidOption);
                            return;
                        }
                        await screening.proceedWithSchoolSelection(conn, chatId, screeningTopic.schools[schoolIndex]);
                        return;
                    case 'cpfTriaged':
                        userCurrentTopic[chatId] = 'problema';
                        await sendProblemOptions(conn, chatId);
                        screening.clearUserTopic(chatId);
                        return; 
                }
            }

            // Continuar com o fluxo normal para outras mensagens
            await handleUserMessage(conn, chatId, messageText, io);
            
        } catch (error) {
            console.error(errors.processError.replace('%s', error.message || 'Unknown error'));
        }
    });

    const originalSendMessage = sendMessage;
    global.sendMessage = async (conn, chatId, message) => {
        const messageId = `send_${chatId}_${Date.now()}`;
        
        if (processedMessageIds.has(messageId)) {
            console.log('Tentativa de envio duplicado evitada:', messageId);
            return;
        }

        
        processedMessageIds.add(messageId);
        setTimeout(() => processedMessageIds.delete(messageId), MESSAGE_EXPIRY);

        return await originalSendMessage(conn, chatId, message);
    };

    conn.client.ev.on('chatClosed', async (chatId) => {
        // Ignora eventos de grupos
        if (!chatId.endsWith('@g.us')) {
            handleChatClosed(chatId, io);
        }
    });
}

/*async function checkIgnoredContact(chatId) {
    try {
        const ignoredContact = await User.findOne({
            where: { chatId, ignored: true }
        });
        return !!ignoredContact;
    } catch (error) {
        console.error('Erro ao verificar contato ignorado:', error);
        return false;
    }
}*/

/**
 * Atualiza o banco de dados e notifica os clientes
 * @param {string} query - Query SQL
 * @param {Array} params - Parâmetros da query
 * @param {Object} io - Objeto Socket.IO
 * @returns {Promise<number>} ID do registro inserido/atualizado
 */
async function updateDatabaseAndNotify(query, params, io) {
    try {
        await sequelize.query(query, { replacements: params });
        const statusData = await getStatusUpdate();
        io.emit('statusUpdate', statusData);
    } catch (error) {
        console.error('Erro na atualização do banco:', error);
    }
}

// Função auxiliar para buscar status atual
async function getStatusUpdate() {
    try {
        const [active, waiting, pending, completed] = await Promise.all([
            Call.findAll({
                where: { status: 'ACTIVE' },
                order: [['id', 'DESC']],
                include: [
                    {
                        model: CreateCall,
                        as: 'createcall',
                        include: [
                            { model: User, as: 'user' },
                            { model: School, as: 'school' }
                        ]
                    }
                ]
            }),
            Call.findAll({
                where: { status: 'WAITING' },
                order: [['id', 'ASC']],
                include: [
                    {
                        model: CreateCall,
                        as: 'createcall',
                        include: [
                            { model: User, as: 'user' },
                            { model: School, as: 'school' }
                        ]
                    }
                ]
            }),
            Call.findAll({
                where: { status: 'PENDING' },
                order: [['id', 'DESC']],
                include: [
                    {
                        model: CreateCall,
                        as: 'createcall',
                        include: [
                            { model: User, as: 'user' },
                            { model: School, as: 'school' }
                        ]
                    }
                ]
            }),
            Call.findAll({
                where: { status: 'COMPLETED' },
                order: [['dateTimeFinish', 'DESC']],
                limit: 10,
                include: [
                    {
                        model: CreateCall,
                        as: 'createcall',
                        include: [
                            { model: User, as: 'user' },
                            { model: School, as: 'school' }
                        ]
                    }
                ]
            })
        ]);

        function flattenCall(call) {
            const plain = call.get({ plain: true });
            const user = plain.createcall && plain.createcall.user ? plain.createcall.user : {};
            const school = plain.createcall && plain.createcall.school ? plain.createcall.school : {};
            return {
                id: plain.id,
                chatId: plain.createcall ? plain.createcall.chatId : '',
                name: user.name || '',
                city: school.client || '',
                position: plain.position || user.type || '',
                school: school.name || '',
                description: plain.description || '',
                queuePosition: plain.queuePosition || '',
                status: plain.status
            };
        }

        return {
            activeChats: active.map(flattenCall),
            waitingList: waiting.map(flattenCall),
            problems: pending.map(flattenCall),
            completedChats: completed.map(flattenCall)
        };
    } catch (error) {
        console.error('Error getting status update:', error);
        return {
            activeChats: [],
            waitingList: [],
            problems: [],
            completedChats: []
        };
    }
}

// Processa novo usuário
async function handleNewUser(conn, chatId, userInfo, io) {
    const activeCount = await Call.count({ where: { status: 'ACTIVE' } });
    const status = activeCount < CONFIG.MAX_ACTIVE_CHATS ? 'ACTIVE' : 'WAITING';
    
    try {
        await saveClientInfoToDatabase(userInfo, chatId, status, io);

        if (status === 'ACTIVE') {
            await sendMessage(
                conn, 
                chatId, 
                greetings.attendantAvailable.replace('%s', userInfo.name)
            );
            await sendProblemOptions(conn, chatId);
            userCurrentTopic[chatId] = 'problema';
        } else {
            const position = await getWaitingPosition(chatId);
            await sendMessage(
                conn,
                chatId,
                greetings.queueUpdate.replace('%s', userInfo.name).replace('%d', position)
            );
        }
    } catch (error) {
        console.error(errors.processError.replace('%s', error));
        await sendMessage(conn, chatId, errors.tryAgainLater);
    }
}

// Função para obter posição na fila
async function getWaitingPosition(chatId) {
    try {
        const waitingUsers = await Call.findAll({
            where: { status: 'WAITING' },
            order: [['createdAt', 'ASC']]
        });

        const position = waitingUsers.findIndex(call => call.chatId === chatId) + 1;
        return position || waitingUsers.length + 1;
    } catch (error) {
        console.error('Erro ao obter posição na fila:', error);
        return null;
    }
}


async function handleUserMessage(conn, chatId, messageText, io) {
    try {
        // Ignorar mensagens de grupos
        if (chatId.endsWith('@g.us')) {
            return;
        }

        // Se o chat está sendo atendido por humano, ignorar
        if (humanAttendedChats.has(chatId)) {
            return;
        }

        // Verificar estado do chat
        const chatState = await Call.findOne({
            where: { chatId },
            order: [['createdAt', 'DESC']]
        });

        // Verificar se já está em processo de triagem
        const screeningTopic = screening.getUserTopic(chatId);
        
        // Se não está em triagem, iniciar triagem
        if (!screeningTopic) {
            await screening.startScreening(conn, chatId);
            // Sincronizar o estado global com o estado do screening
            userCurrentTopic[chatId] = { state: 'awaitingCpf' };
            return;
        }

        // Processar conforme o estado da triagem
        switch (screeningTopic.state) {
            case 'awaitingCpf':
                await screening.handleCpfInput(conn, chatId, messageText, io);
                return;
            case 'awaitingTypeSelection':
                const typeIndex = parseInt(messageText) - 1;
                if (isNaN(typeIndex) || typeIndex < 0 || typeIndex >= screeningTopic.types.length) {
                    await sendMessage(conn, chatId, errors.invalidOption);
                    return;
                }
                await screening.handleTypeSelection(conn, chatId, typeIndex, screeningTopic.types, screeningTopic.schoolsByTypeCity);
                return;
            case 'awaitingCitySelection':
                const cityIndex = parseInt(messageText) - 1;
                if (isNaN(cityIndex) || cityIndex < 0 || cityIndex >= screeningTopic.cities.length) {
                    await sendMessage(conn, chatId, errors.invalidOption);
                    return;
                }
                await screening.handleCitySelection(conn, chatId, cityIndex, screeningTopic.cities, screeningTopic.type);
                return;
            case 'awaitingSchoolSelection':
                const schoolIndex = parseInt(messageText) - 1;
                if (isNaN(schoolIndex) || schoolIndex < 0 || schoolIndex >= screeningTopic.schools.length) {
                    await sendMessage(conn, chatId, errors.invalidOption);
                    return;
                }
                await screening.proceedWithSchoolSelection(conn, chatId, screeningTopic.schools[schoolIndex]);
                return;
            case 'cpfTriaged':
                // Após triagem completa, continuar com fluxo normal
                userCurrentTopic[chatId] = 'problema';
                await sendProblemOptions(conn, chatId);
                screening.clearUserTopic(chatId); // Limpar estado da triagem
                return; // <-- Adicionado para evitar fluxo duplo
        }

        // Continuar com o resto do fluxo existente para outras mensagens
        if (userCurrentTopic[chatId] === 'problema') {
            await handleProblemSelection(conn, chatId, messageText, io);
        } else if (userCurrentTopic[chatId]?.stage === 'subproblema') {
            await handleSubProblemSelection(conn, chatId, messageText, io);
        }

        // Use updateDatabaseAndNotify with proper parameters
        await updateDatabaseAndNotify(
            'UPDATE calls SET status = ? WHERE chatId = ?',
            ['ACTIVE', chatId],
            io
        );
        
    } catch (error) {
        console.error(errors.processError.replace('%s', error));
    }
}

//Função para obter estado do chat
async function getChatState(chatId) {
    try {
        const chatState = await Call.findOne({
            where: { chatId },
            order: [['createdAt', 'DESC']]
        });
        return chatState;
    } catch (error) {
        console.error('Erro ao obter estado do chat:', error);
        return null;
    }
}

function getRandomDelay() {
    return Math.floor(Math.random() * (RESPONSE_DELAY.MAX - RESPONSE_DELAY.MIN + 1) + RESPONSE_DELAY.MIN);
}

function getRandomWelcomeMessage() {
    const messages = greetings.welcome;
    if (!Array.isArray(messages) || messages.length === 0) {
        return 'Olá! Por favor, envie suas informações no formato:';
    }
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
}

async function sendFormattedMessage(conn, chatId, type) {
    switch (type) {
        case 'template':
            // Mantém delay inicial longo
            await new Promise(resolve => setTimeout(resolve, getRandomDelay()));
            await sendMessage(conn, chatId, getRandomWelcomeMessage());
            // Reduz delay do template
            await new Promise(resolve => setTimeout(resolve, 1500));
            await sendMessage(conn, chatId, greetings.template);
            break;
        default:
            await sendMessage(conn, chatId, getRandomWelcomeMessage());
    }
}

// Processa fechamento do chat
async function handleChatClosed(chatId, io) {
    try {
        // Marcar chat como concluído
        await Call.update(
            { status: 'COMPLETED', dateTimeFinish: new Date() },
            { where: { chatId } }
        );

        // Obter próximo usuário na lista de espera
        const nextUser = await getNextInWaitingList();
        
        // Verificar se existe próximo usuário
        if (nextUser) {
            // Atualizar status do próximo usuário
            await Call.update(
                { status: 'ACTIVE' },
                { where: { chatId: nextUser.chatId } }
            );

            // Enviar mensagem para o próximo usuário
            await sendMessage(
                botConnection,
                nextUser.chatId,
                greetings.nextInLine.replace('%s', nextUser.name)
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // Atualizar posições de todos os usuários em espera
        await updateWaitingUsers(io);
        
        // Buscar e transmitir status atualizado para todos os clientes
        await sendStatusUpdateToMainProcess(io);

    } catch (error) {
        console.error(errors.processError.replace('%s', error));
    }
}

/**
 * Envia uma mensagem para o usuário através do WhatsApp
 * @param {Object} conn - Conexão com o WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem a ser enviada
 * @returns {Promise<void>}
 */
// Controle de mensagens recentes
const recentMessages = new Map();
const MESSAGE_TIMEOUT = 2000; 

const sentMessages = new Map();
const DEBOUNCE_TIME = 2000; 


async function sendMessage(conn, chatId, message) {
    if (!messageQueue.has(chatId)) {
        messageQueue.set(chatId, Promise.resolve());
    }

    return messageQueue.get(chatId).then(async () => {
        const now = Date.now();
        const lastMessage = sentMessages.get(chatId);

        if (lastMessage && 
            lastMessage.text === message && 
            (now - lastMessage.timestamp) < DEBOUNCE_TIME) {
            console.log(logs.similarMessage.replace('%s', message));
            return;
        }

        try {
            if (!conn || !conn.client || !message) {
                throw new Error('Invalid connection or message');
            }

            await conn.client.sendMessage({
                to: chatId,
                body: message,
                options: { type: 'sendText' }
            });

            sentMessages.set(chatId, {
                text: message,
                timestamp: now
            });

            await new Promise(resolve => setTimeout(resolve, CONFIG.MESSAGE_DELAY));
        } catch (error) {
            console.error(errors.sendError.replace('%s', error.message || 'Unknown error'));
            throw error;
        }
    });
}

// Envia opções de problema para o usuário
async function sendProblemOptions(conn, chatId) {
    await sendMessage(conn, chatId, dialogs.problemOptions);
}

/**
 * Manipula a seleção de problemas pelo usuário
 * Direciona para fluxos específicos baseado na escolha
 * @param {Object} conn - Conexão com WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} messageText - Texto da mensagem recebida
 * @param {Object} io - Instância do Socket.IO
 */
async function handleProblemSelection(conn, chatId, messageText, io) {
    switch (messageText) {
        case '1':
            await sendMessage(conn, chatId, dialogs.subProblems.accessSystem.title);
            userCurrentTopic[chatId] = { problem: 'Acesso ao sistema', stage: 'subproblema' };
            break;
        case '2':
            await sendMessage(conn, chatId, dialogs.subProblems.registration.title);
            userCurrentTopic[chatId] = { problem: 'Cadastro de aluno/funcionário', stage: 'subproblema' };
            break;
        case '3':
            await sendMessage(conn, chatId, dialogs.subProblems.classLog.title);
            userCurrentTopic[chatId] = { problem: 'Diário de classe', stage: 'subproblema' };
            break;
        case '4':
            await sendMessage(conn, chatId, dialogs.subProblems.studentMovement.title);
            userCurrentTopic[chatId] = { problem: 'Movimentação de Alunos', stage: 'subproblema' };
            break;
        case '5':
            await sendMessage(conn, chatId, dialogs.rfaceContact);
            delete userCurrentTopic[chatId];
            // Emitir evento endChat
            io.emit('endChat', { chatId });
            await closeChat(chatId, io);
            break;
        case '6':
            await sendMessage(conn, chatId, dialogs.describeIssue);
            userCurrentTopic[chatId] = { 
                state: 'descricaoProblema',
                type: 'custom'
            };
            break;
        case commands.backCommand:
            await sendProblemOptions(conn, chatId);
            break;
        default:
            await sendMessage(conn, chatId, errors.invalidOption);
    }
}

// Envia opções de subproblema para o usuário
async function sendSubProblemOptions(conn, chatId, problem) {
  const subProblemOptions = getSubProblemOptions(problem);
  userCurrentTopic[chatId] = { problem, stage: 'subproblema' }; 
  await sendMessage(conn, chatId, subProblemOptions);
}

function getSubProblemOptions(problem) {
    const key = PROBLEM_MAPPINGS[problem];
    if (key && dialogs.subProblems[key]) {
        return `${dialogs.subProblems[key].title}\n\n${commands.backMessage}`;
    }
    return errors.invalidOption;
}
function getSubProblemText(problem, subProblem) {
    const key = PROBLEM_MAPPINGS[problem];
    if (key && dialogs.subProblems[key]?.options[subProblem]) {
        return dialogs.subProblems[key].options[subProblem];
    }
    return 'Outro problema';
}

function getVideoUrlForSubProblem(subProblem, chatId) {
    const mainProblem = userCurrentTopic[chatId].problem;
    const key = PROBLEM_MAPPINGS[mainProblem];
    if (key && dialogs.subProblems[key]?.videos[subProblem]) {
        return dialogs.subProblems[key].videos[subProblem];
    }
    return errors.invalidOption;
}

// Processa seleção de subproblema
async function handleSubProblemSelection(conn, chatId, messageText, io) {
    try {
        if (messageText === 'voltar') {
            userCurrentTopic[chatId] = 'problema';
            await sendProblemOptions(conn, chatId);
            return;
        }

        const mainProblem = userCurrentTopic[chatId].problem;
        const problemKey = PROBLEM_MAPPINGS[mainProblem];

        // Verifica se é uma opção válida para o problema específico
        if (!problemKey || !dialogs.subProblems[problemKey]?.options[messageText]) {
            await sendMessage(conn, chatId, errors.invalidOption);
            return;
        }

        const subProblemText = dialogs.subProblems[problemKey].options[messageText];
        const videoUrl = dialogs.subProblems[problemKey].videos[messageText];

        // Buscar informações do usuário
        const userInfo = await User.findOne({
            where: { chatId },
            include: [School]
        });

        if (!userInfo) {
            throw new Error('Usuário não encontrado');
        }

        // Criar novo registro de problema
        const problemDescription = `${mainProblem} - ${subProblemText}`;
        const date = new Date();

        await Call.create({
            chatId,
            description: problemDescription,
            status: 'PENDING',
            date
        });

        await sendMessage(conn, chatId, dialogs.watchVideo.replace('%s', videoUrl));
        await sendMessage(conn, chatId, 'O vídeo foi suficiente para resolver seu problema? (sim/não)');
        userCurrentTopic[chatId] = 'videoFeedback';

        // Emitir evento com o novo problema
        io.emit('userProblem', problemDescription, chatId, userInfo.name);
        await sendStatusUpdateToMainProcess(io);

    } catch (error) {
        console.error('Erro em handleSubProblemSelection:', error);
        await sendMessage(conn, chatId, 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.');
        userCurrentTopic[chatId] = 'problema';
    }
}

// Processa feedback do vídeo
async function handleVideoFeedback(conn, chatId, messageText, io) {
    try {
        if (messageText.toLowerCase() === 'sim') {
            await sendMessage(conn, chatId, finished.helpfulVideo);
            await ServiceFeedback.requestFeedback(botConnection, chatId);
            userCurrentTopic[chatId] = 'serviceFeedback';
        } else if (messageText.toLowerCase() === 'não') {
            await sendMessage(conn, chatId, dialogs.describeIssue);
            userCurrentTopic[chatId] = {
                state: 'descricaoProblema',
                previousState: 'videoFeedback'
            };
        } else {
            await sendMessage(conn, chatId, errors.invalidYesNo);
        }
    } catch (error) {
        console.error('Erro em handleVideoFeedback:', error);
    }
}

// Processa descrição do problema
async function handleProblemDescription(conn, chatId, messageText, io) {
    try {
        // Get user info for possible new problem creation
        const userInfo = await User.findOne({
            where: { chatId },
            include: [School]
        });

        if (!userInfo) {
            throw new Error('Usuário não encontrado');
        }

        const date = new Date();
        const description = messageText;

        // Check if this is from video feedback "não" response or option 6
        const isFromVideo = userCurrentTopic[chatId]?.previousState === 'videoFeedback';

        if (isFromVideo) {
            // Update the most recent problem for video feedback case
            const existingProblem = await Call.findOne({
                where: { chatId },
                order: [['createdAt', 'DESC']]
            });

            if (existingProblem) {
                await Call.update(
                    { description, date },
                    { where: { id: existingProblem.id } }
                );

                io.emit('userProblem', {
                    description,
                    chatId,
                    name: userInfo.name,
                    city: userInfo.city,
                    position: userInfo.type,
                    school: userInfo.school.name
                });
            }
        } else {
            // Create new problem record for option 6
            await Call.create({
                chatId,
                description,
                status: 'PENDING',
                date
            });

            // Emit new problem event
            io.emit('userProblem', {
                description,
                chatId,
                name: userInfo.name,
                city: userInfo.city,
                position: userInfo.type,
                school: userInfo.school.name
            });
        }

        // Common actions for both cases
        await sendMessage(
            conn, 
            chatId, 
            finished.problemRegistered
        );

        await sendStatusUpdateToMainProcess(io);
        humanAttendedChats.add(chatId);
        delete userCurrentTopic[chatId];

    } catch (error) {
        console.error('Erro em handleProblemDescription:', error);
        await sendMessage(
            conn, 
            chatId, 
            errors.tryAgainLater
        );
        userCurrentTopic[chatId] = 'problema';
        await sendProblemOptions(conn, chatId);
    }
}

// Salvar informações do cliente no banco de dados
async function saveClientInfoToDatabase(userInfo, chatId, status, io) {
    try {
        const [school] = await School.findOrCreate({
            where: { name: userInfo.school },
            defaults: {
                name: userInfo.school,
                // Add other required school fields with default values
                inep: '',
                client: '',
                neighborhood: '',
                street: '',
                number: ''
            }
        });

        const [user] = await User.findOrCreate({
            where: { chatId: chatId },
            defaults: {
                name: userInfo.name,
                type: userInfo.position,
                identifier: ''
            }
        });

        await CreateCall.create({
            idUser: user.id,
            idSchool: school.id,
            chatId: chatId,
            date: new Date()
        });

        io.emit('statusUpdate');
    } catch (error) {
        console.error('Error saving client info:', error);
    }
}

// Salvar problema no banco de dados
async function saveProblemToDatabase(problemData, io) {
    try {
        await Call.update({
            description: problemData.description
        }, {
            where: { id: problemData.problemId }
        });

        await sendStatusUpdateToMainProcess(io);
    } catch (error) {
        console.error('Error saving problem:', error);
    }
}

// Marcar problema como concluído no banco de dados
async function markProblemAsCompleted(problemId, io) {
    try {
        await Call.update({
            status: 'COMPLETED',
            dateTimeFinish: new Date()
        }, {
            where: { id: problemId }
        });

        await sendStatusUpdateToMainProcess(io);
    } catch (error) {
        console.error('Error marking problem as completed:', error);
    }
}

// Enviar atualização de status para o processo principal
async function sendStatusUpdateToMainProcess(io) {
    try {
        const statusData = await getStatusUpdate();

        // Emitir atualização para todos os clientes
        io.emit('statusUpdate', statusData);
        
        // Log de depuração
        console.log('Status atualizado:', {
            activeCount: statusData.activeChats.length,
            waitingCount: statusData.waitingList.length,
            pendingCount: statusData.problems.length,
            completedCount: statusData.completedChats.length
        });

    } catch (error) {
        console.error('Erro ao atualizar status:', error);
    }
}

// Enviar problema para o front-end
function sendProblemToFrontEnd(problemData) {
  if (problemData.description.startsWith('Subtópico:')) {
    return;
  }
  ipcMain.emit('userProblem', null, problemData.description, problemData.chatId, problemData.name);
}

// Fechar o chat
async function closeChat(chatId, io) {
    try {
        // 1. Atualizar status para completed imediatamente
        await Call.update(
            { status: 'COMPLETED', dateTimeFinish: new Date() },
            { where: { chatId } }
        );

        // 2. Emitir atualização imediata da UI
        const statusData = await getStatusUpdate();
        io.emit('statusUpdate', statusData);

        // 4. Processa próximo usuário na fila
        const nextUser = await getNextInWaitingList();
        if (nextUser) {
            await Call.update(
                { status: 'ACTIVE' },
                { where: { chatId: nextUser.chatId } }
            );

            await sendMessage(
                botConnection,
                nextUser.chatId,
                greetings.nextInLine.replace('%s', nextUser.name)
            );
            await sendProblemOptions(botConnection, nextUser.chatId);
        }

        // 5. Atualiza posições dos usuários em espera
        await updateWaitingUsers(io);

    } catch (error) {
        console.error(errors.processError.replace('%s', error));
    }
}

// Função para obter próximo da fila
async function getNextInWaitingList() {
    try {
        const nextCall = await Call.findOne({
            where: { status: 'WAITING' },
            order: [['createdAt', 'ASC']],
            include: [User, School]
        });
        return nextCall;
    } catch (error) {
        console.error('Error getting next in waiting list:', error);
        return null;
    }
}


async function attendNextUserInQueue(conn, io) {
    const nextUser = activeChatsList.find(chat => chat.isWaiting);
    if (nextUser) {
        nextUser.isWaiting = false;
        await sendMessage(
            conn, 
            nextUser.chatId, 
            commands.nextInQueueMessage.replace('%s', nextUser.name)
        );
        await sendProblemOptions(conn, nextUser.chatId);
        userCurrentTopic[nextUser.chatId] = 'problema';
        sendStatusUpdateToMainProcess(io);
    }
}

// Atender o próximo usuário na fila
async function attendNextUserInQueue(conn, io) {
  const nextUser = activeChatsList.find(chat => chat.isWaiting);
  if (nextUser) {
    nextUser.isWaiting = false;
    await sendMessage(conn, nextUser.chatId, `Obrigado por aguardar, ${nextUser.name}. Estamos iniciando seu atendimento.`);
    await sendProblemOptions(conn, nextUser.chatId);
    userCurrentTopic[nextUser.chatId] = 'problema';
    sendStatusUpdateToMainProcess(io);
  }
}

// Obter a lista de espera
function getWaitingList() {
  return activeChatsList.filter(chat => chat.isWaiting);
}

function redirectToWhatsAppChat(chatId) {
    try {
        // Remove '@c.us' se presente e remove quaisquer caracteres não numéricos
        const cleanNumber = chatId.replace('@c.us', '').replace(/\D/g, '');
        
        // Verifica se o número está vazio após a limpeza
        if (!cleanNumber) {
            console.error('ID de chat inválido:', chatId);
            return;
        }

        const whatsappUrl = `https://wa.me/${cleanNumber}`;
        console.log('Redirecionando para:', whatsappUrl);
        require('electron').shell.openExternal(whatsappUrl);
    } catch (error) {
        console.error('Erro ao redirecionar para WhatsApp:', error);
    }
}

async function updateWaitingUsers(io) {
    try {
        const waitingUsers = await Call.findAll({
            where: { status: 'WAITING' },
            order: [['createdAt', 'ASC']]
        });

        // Para cada usuário em espera, calcular e enviar sua posição atual
        for (let i = 0; i < waitingUsers.length; i++) {
            const user = waitingUsers[i];
            const currentPosition = i + 1; // Posição baseada no índice + 1
            
            const message = greetings.queueUpdate.replace('%s', user.name).replace('%d', currentPosition);
            
            if (botConnection) {
                await sendMessage(botConnection, user.chatId, message);
            }
        }
    } catch (error) {
        console.error('Erro ao atualizar usuários em espera:', error);
    }
}

// Função auxiliar para converter status em texto legível
function getStatusText(status) {
    const statusMap = {
        'ACTIVE': 'Em atendimento',
        'WAITING': 'Em espera',
        'COMPLETED': 'Concluído',
        'PENDING': 'Pendente'
    };
    return statusMap[status] || status;
}

module.exports = {
    startHydraBot,
    redirectToWhatsAppChat,
    server,
    getRecentContacts,
    getBotConnection: () => botConnection,
    getStatusUpdate 
};
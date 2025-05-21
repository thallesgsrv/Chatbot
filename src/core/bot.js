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
const Screening = require('./modules/screening');
const ProblemManager = require('./modules/problemmanager');
const DisabledContactManager = require('./contacts/disabledcontacts.js');

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
const messageHistory = new Map();


const processedEvents = new Set();
const EVENT_TIMEOUT = 2000; 

// Initialize Screening instance
let screening;
let problemManager;

/**
 * Template de boas-vindas e coleta de informações
 * Solicita dados básicos do usuário para início do atendimento
 */
const defaultMessage = greetings.welcome;

// Inicializar Express
const server = express();

// Adicionar middleware JSON
server.use(express.json());

class SharedState {
    constructor() {
        this.humanAttendedChats = new Set();
    }

    markChatAsHumanAttended(chatId) {
        this.humanAttendedChats.add(chatId);
    }

    isHumanAttended(chatId) {
        return this.humanAttendedChats.has(chatId);
    }

    removeChatFromHumanAttended(chatId) {
        this.humanAttendedChats.delete(chatId);
    }
}

const sharedState = new SharedState();

/**
 * Inicializa o servidor do bot e configura eventos principais
 * @param {Object} io - Instância do Socket.IO para comunicação em tempo real
 */
async function startHydraBot(io) {
    try {
        BOT_START_TIME = Date.now(); 
        bot = await hydraBot.initServer({
            puppeteerOptions: {
                headless: CONFIG.DEFAULT_HEADLESS,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            }
        });

        console.log('Bot initialized successfully');
        
        // Update initialization to use shared state
        problemManager = new ProblemManager(io, botConnection, null, sharedState);
        screening = new Screening(io, getStatusUpdate, problemManager, sharedState);
        problemManager.setScreening(screening);
        
        bot.on('connection', async (conn) => {
            if (conn.connect) {
                console.log(logs.connectionEstablished);
                conn.io = io; 
                botConnection = conn;
                problemManager.setBotConnection(conn);
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
    
    io.on('connection', async (socket) => {

        socket.on('getAttendants', async () => {
            try {
                const attendants = await Attendant.findAll({
                    order: [['name', 'ASC']]
                });
                socket.emit('attendantList', attendants);
            } catch (error) {
                console.error('Erro ao buscar atendentes:', error);
                socket.emit('error', { message: 'Erro ao buscar atendentes' });
            }
        });

        socket.on('createCard', async (data) => {
            try {
                // Forward the request to the API endpoint instead of creating card directly
                const response = await fetch('http://localhost:3000/api/problem-cards/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    throw new Error('Falha ao criar card via API');
                }

                const card = await response.json();
                io.emit('cardCreated', card);
            } catch (error) {
                console.error('Erro ao processar criação do card:', error);
                socket.emit('cardError', { 
                    error: 'Erro ao criar card: ' + error.message 
                });
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
                const { chatId } = data;
                
                const eventId = `end_${chatId}_${Date.now()}`;
                if (processedEvents.has(eventId)) return;
                
                processedEvents.add(eventId);
                setTimeout(() => processedEvents.delete(eventId), EVENT_TIMEOUT);

                if (problemManager) {
                    await problemManager.handleChatEnd(
                        botConnection,
                        chatId
                    );
                }

            } catch (error) {
                console.error('Erro ao finalizar chat:', error);
                socket.emit('error', { 
                    message: 'Erro ao finalizar chat: ' + error.message 
                });
            }
        });
    
        socket.on('attendProblem', async (data) => {
            try {
                const { chatId, attendantName } = data;
                
                if (!chatId || !attendantName) {
                    throw new Error('ChatId e nome do atendente são obrigatórios');
                }

                // Procurar ou criar o atendente
                const [attendant] = await Attendant.findOrCreate({
                    where: { 
                        name: attendantName 
                    },
                    defaults: {
                        name: attendantName
                    }
                });

                const createCall = await CreateCall.findOne({
                    where: { chatId },
                    order: [['date', 'DESC']]
                });

                if (createCall) {
                    const call = await Call.findOne({
                        where: { createCallId: createCall.id }
                    });

                    if (call) {
                        await call.update({
                            attendantId: attendant.id
                        });
                    }
                }

                // Resto do código de manipulação do atendimento
                if (problemManager) {
                    await problemManager.handleProblemAttendance(
                        botConnection, 
                        { chatId }, 
                        attendantName
                    );
                }

            } catch (error) {
                console.error('Erro ao atender problema:', error);
                socket.emit('error', { message: 'Erro ao atender problema' });
            }
        });
    });
}

// Controle de mensagens recentes
const recentMessages = new Map();
const MESSAGE_TIMEOUT = 2000; 

const sentMessages = new Map();
const DEBOUNCE_TIME = 2000; 

// Ouvir mensagens recebidas
async function startListeningForMessages(conn, io) {
    const processedMessageIds = new Set();
    const MESSAGE_EXPIRY = 60000;

    conn.client.ev.on('newMessage', async (newMsg) => {
        const messageId = `${newMsg.result.id || newMsg.result.messageId || Date.now()}_${newMsg.result.chatId}`;
        const chatId = newMsg.result.chatId;
        const phone = chatId.replace('@c.us', '');

        // Check if contact is disabled first
        if (await DisabledContactManager.isDisabled(phone)) {
            console.log(`Mensagem ignorada de contato desabilitado: ${phone}`);
            return;
        }
        
        // Early return if already processed
        if (processedMessageIds.has(messageId)) {
            console.log(logs.processedMessage.replace('%s', messageId));
            return;
        }

        // Add message to processed set
        processedMessageIds.add(messageId);
        setTimeout(() => processedMessageIds.delete(messageId), MESSAGE_EXPIRY);

        // Fix timestamp handling
        let messageTimestamp = normalizeTimestamp(newMsg.result);

        // Ignore old messages
        if (messageTimestamp < BOT_START_TIME) {
            return;
        }

        try {
            // Ignore bot messages and group messages
            if (newMsg.result.fromMe || chatId.endsWith('@g.us')) {
                return;
            }

            // Single check for human attended status
            if (sharedState.isHumanAttended(chatId)) {
                return;
            }

            const messageText = newMsg.result.body.toLowerCase();

            
            const recoveryResponse = await handleRecovery(newMsg.result);
            if (recoveryResponse) {
                await sendMessage(conn, chatId, recoveryResponse);
                return;
            }

            const screeningTopic = screening.getUserTopic(chatId);
            const problemTopic = problemManager.getUserTopic(chatId);

    
            if (problemTopic) {
                if (problemTopic.state === 'descricaoProblema' || 
                    problemTopic.state === 'awaitingFeedback' || 
                    problemTopic.state === 'awaitingRating') {
                    await problemManager.handleMessage(conn, chatId, messageText);
                    return;
                }
            }

            
            if (!screeningTopic && !problemTopic) {
                await screening.startScreening(conn, chatId);
                return;
            }

            // Handle existing screening flow
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
                        await screening.handleTypeSelection(conn, chatId, typeIndex);
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
                        // Salva o estado atual antes de limpar
                        const currentUserData = screeningTopic;
                        // Limpa o tópico de triagem
                        screening.clearUserTopic(chatId);
                        // Define o tópico do problemManager e envia opções imediatamente
                        problemManager.setUserTopic(chatId, 'problema');
                        await problemManager.sendProblemOptions(conn, chatId);
                        return;
                }
            }

            // Se o usuário está no fluxo de problemas, delegar ao problemManager
            const pmTopic = problemManager.getUserTopic(chatId);
            if (pmTopic) {
                if (pmTopic === 'problema' && messageText) {
                    await problemManager.handleProblemSelection(conn, chatId, messageText);
                    return;
                }
                if (pmTopic.stage === 'subproblema') {
                    await problemManager.handleSubProblemSelection(conn, chatId, messageText);
                    return;
                }
                if (pmTopic.state === 'descricaoProblema') {
                    await problemManager.handleCustomProblem(conn, chatId, newMsg.result.body);
                    return;
                }
                if (pmTopic.state === 'awaitingFeedback') {
                    await problemManager.handleVideoFeedback(conn, chatId, messageText);
                    return;
                }
                if (pmTopic.state === 'awaitingRating') {
                    await problemManager.handleRating(conn, chatId, messageText);
                    return;
                }
            }

            // Se não está em triagem nem em problema, iniciar triagem
            if (!screeningTopic && !pmTopic) {
                await screening.startScreening(conn, chatId);
                return;
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
                where: { status: ['ACTIVE', 'PENDING'] }, 
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
            problems: pending
                .map(flattenCall)
                .filter(call => call.status === 'PENDING'),
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
            order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'ASC']],
            include: [{
                model: CreateCall,
                as: 'createcall'
            }]
        });

        const position = waitingUsers.findIndex(call => call.createcall && call.createcall.chatId === chatId) + 1;
        return position || waitingUsers.length + 1;
    } catch (error) {
        console.error('Erro ao obter posição na fila:', error);
        return null;
    }
}


async function handleUserMessage(conn, chatId, messageText, io) {
    try {
        if (chatId.endsWith('@g.us')) return;
        
        
        if (sharedState.isHumanAttended(chatId) || 
            problemManager.isHumanAttended(chatId) || 
            screening.isHumanAttended(chatId)) {
            return;
        }

        const screeningTopic = screening.getUserTopic(chatId);
        
        if (!screeningTopic) {
            await screening.startScreening(conn, chatId);
            return;
        }

        if (screeningTopic.state) {
            await handleScreeningState(conn, chatId, messageText, screeningTopic, io);
            return;
        }

        const currentTopic = problemManager.getUserTopic(chatId);
        const messageTextLower = messageText.toLowerCase();

        if (currentTopic === 'problema') {
            await problemManager.handleProblemSelection(conn, chatId, messageTextLower);
        } else if (currentTopic?.stage === 'subproblema') {
            await problemManager.handleSubProblemSelection(conn, chatId, messageTextLower);
        } else if (currentTopic?.state === 'descricaoProblema') {
            await problemManager.handleCustomProblem(conn, chatId, messageText);
        }
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        await sendMessage(conn, chatId, errors.tryAgainLater);
    }
}

async function handleScreeningState(conn, chatId, messageText, screeningTopic, io) {
    switch (screeningTopic.state) {
        case 'awaitingPrivacyConfirmation':
            await screening.handlePrivacyConfirmation(conn, chatId, messageText);
            break;
        case 'awaitingCpf':
            await screening.handleCpfInput(conn, chatId, messageText, io);
            break;
        case 'awaitingTypeSelection':
            await handleTypeSelection(conn, chatId, messageText, screeningTopic);
            break;
        case 'awaitingSchoolSelection':
            await handleSchoolSelection(conn, chatId, messageText, screeningTopic);
            break;
        case 'cpfTriaged':
            screening.clearUserTopic(chatId);
            break;
    }
}

async function sendProblemOptions(conn, chatId) {
    await problemManager.sendProblemOptions(conn, chatId);
}

// Processa fechamento do chat
async function handleChatClosed(chatId, io) {
    try {
        // First emit chatCompleted event immediately
        io.emit('chatCompleted', { chatId });
        
        // Mark chat as completed
        await Call.update(
            { status: 'COMPLETED', dateTimeFinish: new Date() },
            {
                where: {},
                include: [{
                    model: CreateCall,
                    as: 'createcall',
                    where: { chatId }
                }]
            }
        );

        // Remove from active chats immediately
        if (sharedState.isHumanAttended(chatId)) {
            sharedState.removeChatFromHumanAttended(chatId);
        }

        // Get next user in waiting list
        const nextUser = await getNextInWaitingList();
        
        if (nextUser) {
            await Call.update(
                { status: 'ACTIVE' },
                { where: { id: nextUser.id } }
            );

            await sendMessage(
                botConnection,
                nextUser.createcall.chatId,
                greetings.nextInLine.replace('%s', nextUser.createcall.user ? nextUser.createcall.user.name : '')
            );
            await sendProblemOptions(botConnection, nextUser.createcall.chatId);
        }

        // Update waiting users and send status update
        await updateWaitingUsers(io);
        await sendStatusUpdateToMainProcess(io);

        // Force an immediate UI refresh
        io.emit('forceUpdate');

    } catch (error) {
        console.error('Erro ao finalizar chat:', error);
    }
}

/**
 * Envia uma mensagem para o usuário através do WhatsApp
 * @param {Object} conn - Conexão com o WhatsApp
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem a ser enviada
 * @returns {Promise<void>}
 */
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

// Salvar informações do cliente no banco de dados
async function saveClientInfoToDatabase(userInfo, chatId, status, io) {
    try {
        const [school] = await School.findOrCreate({
            where: { name: userInfo.school },
            defaults: {
                name: userInfo.school,
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
            userId: user.id,
            schoolId: school.id,
            chatId: chatId,
            date: new Date()
        });

        io.emit('statusUpdate');
    } catch (error) {
        console.error('Error saving client info:', error);
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

async function updateWaitingUsers(io) {
    try {
        const waitingUsers = await Call.findAll({
            where: { status: 'WAITING' },
            order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'ASC']],
            include: [{
                model: CreateCall,
                as: 'createcall',
                include: [User]
            }]
        });

        // Para cada usuário em espera, calcular e enviar sua posição atual
        for (let i = 0; i < waitingUsers.length; i++) {
            const call = waitingUsers[i];
            const currentPosition = i + 1; // Posição baseada no índice + 1
            const user = call.createcall && call.createcall.user ? call.createcall.user : {};
            const chatId = call.createcall ? call.createcall.chatId : '';
            const name = user.name || '';
            
            const message = greetings.queueUpdate.replace('%s', name).replace('%d', currentPosition);
            
            if (botConnection && chatId) {
                await sendMessage(botConnection, chatId, message);
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

function redirectToWhatsAppChat(chatId) {
    try {
        // Removes '@c.us' if present and removes any non-numeric characters
        const cleanNumber = chatId.replace('@c.us', '').replace(/\D/g, '');
        
        // Checks if the number is empty after cleaning
        if (!cleanNumber) {
            console.error('Invalid chat ID:', chatId);
            return;
        }

        const whatsappUrl = `https://wa.me/${cleanNumber}`;
        console.log('Redirecting to:', whatsappUrl);
        require('electron').shell.openExternal(whatsappUrl);
    } catch (error) {
        console.error('Error redirecting to WhatsApp:', error);
    }
}

/**
 * Normalizes different WhatsApp timestamp formats into milliseconds
 * @param {Object} msg - The WhatsApp message object
 * @returns {number} Timestamp in milliseconds
 */
function normalizeTimestamp(msg) {
    if (!msg) return Date.now();

    // Primeiro tenta pegar o timestamp direto da mensagem
    const timestamp = msg.messageTimestamp || msg.timestamp;
    
    if (typeof timestamp === 'number') {
        // Se for menor que 1e12, é provável que seja em segundos (formato antigo)
        // Se for maior, já está em milissegundos (formato novo)
        return timestamp < 1e12 ? timestamp * 1000 : timestamp;
    }

    // Tenta extrair timestamp do ID da mensagem (algumas versões do WhatsApp incluem isso)
    if (msg.id && typeof msg.id === 'string') {
        const matches = msg.id.match(/_(\d+)@/);
        if (matches && matches[1]) {
            const extracted = parseInt(matches[1], 10);
            if (!isNaN(extracted)) {
                return extracted;
            }
        }
    }

    // Se tiver uma string de data ISO
    if (typeof timestamp === 'string') {
        const parsed = Date.parse(timestamp);
        if (!isNaN(parsed)) return parsed;
    }

    // Se nada funcionar, retorna o tempo atual
    return Date.now();
}

module.exports = {
    startHydraBot,
    redirectToWhatsAppChat, 
    server,
    getRecentContacts,
    getBotConnection: () => botConnection,
    getStatusUpdate 
};
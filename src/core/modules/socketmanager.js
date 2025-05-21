const sharedState = {
    humanAttendedChats: new Set(),
    markChatAsHumanAttended(chatId) {
        this.humanAttendedChats.add(chatId);
    },
    isHumanAttended(chatId) {
        return this.humanAttendedChats.has(chatId);
    },
    removeChatFromHumanAttended(chatId) {
        this.humanAttendedChats.delete(chatId);
    }
};

async function getStatusUpdate() {
    try {
        const [active, waiting, pending, completed] = await Promise.all([
            Call.findAll({
                where: { status: ['ACTIVE', 'PENDING'] },
                order: [['id', 'DESC']],
                include: [{
                    model: CreateCall,
                    as: 'createcall',
                    include: [
                        { model: User, as: 'user' },
                        { model: School, as: 'school' }
                    ]
                }]
            }),
            Call.findAll({
                where: { status: 'WAITING' },
                order: [['id', 'DESC']],
                include: [{
                    model: CreateCall,
                    as: 'createcall',
                    include: [
                        { model: User, as: 'user' },
                        { model: School, as: 'school' }
                    ]
                }]
            }),
            Call.findAll({
                where: { status: 'PENDING' },
                order: [['id', 'DESC']],
                include: [{
                    model: CreateCall,
                    as: 'createcall',
                    include: [
                        { model: User, as: 'user' },
                        { model: School, as: 'school' }
                    ]
                }]
            }),
            Call.findAll({
                where: { status: 'COMPLETED' },
                order: [['id', 'DESC']],
                include: [{
                    model: CreateCall,
                    as: 'createcall',
                    include: [
                        { model: User, as: 'user' },
                        { model: School, as: 'school' }
                    ]
                }]
            })
        ]);

        return {
            activeChats: active.map(flattenCall),
            waitingList: waiting.map(flattenCall),
            problems: pending.map(flattenCall).filter(call => call.status === 'PENDING'),
            completedChats: completed.map(flattenCall)
        };
    } catch (error) {
        console.error('Error getting status update:', error);
        return {
            activeChats: [], waitingList: [], 
            problems: [], completedChats: []
        };
    }
}

function flattenCall(call) {
    const plain = call.get({ plain: true });
    const user = plain.createcall?.user || {};
    const school = plain.createcall?.school || {};
    return {
        id: plain.id,
        chatId: plain.createcall?.chatId || '',
        name: user.name || '',
        city: school.client || '',
        position: plain.position || user.type || '',
        school: school.name || '',
        description: plain.description || '',
        queuePosition: plain.queuePosition || '',
        status: plain.status
    };
}

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
                console.log('Encaminhando solicitação de criação de card para API:', data);
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
                console.log('Card criado com sucesso:', card);
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
                const { chatId, id, requestFeedback } = data;
                
                const eventId = `end_${chatId}_${Date.now()}`;
                if (processedEvents.has(eventId)) return;
                
                processedEvents.add(eventId);
                setTimeout(() => processedEvents.delete(eventId), EVENT_TIMEOUT);

                sharedState.removeChatFromHumanAttended(chatId);

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

module.exports = {
    setupEventListeners,
    sharedState,
    getStatusUpdate
};
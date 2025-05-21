// Estabelece conexão WebSocket com o servidor local
const socket = io('http://localhost:3000');

// Registra evento de conexão bem-sucedida
socket.on('connect', () => {
    console.log('Conectado ao servidor de WebSocket');
});

// Manipula atualizações de status recebidas do servidor
socket.on('statusUpdate', (data) => {
    // Verifica se os dados são válidos antes de atualizar a UI
    if (data && typeof data === 'object') {
        // Forçar limpeza dos containers antes de atualizar
        activeChatList.innerHTML = '';
        waitingListContainer.innerHTML = '';
        problemListContainer.innerHTML = '';
        
        // Atualizar UI
        updateUI(data);
    }
});

// Adicionar novo listener para forçar atualização
socket.on('forceUpdate', () => {
    fetchDataAndUpdateUI();
});

// Manipula novos problemas reportados pelos usuários
socket.on('userProblem', (problemData) => {    
    // Normaliza os dados do problema
    const data = typeof problemData === 'string' ? 
        { description: problemData } : problemData;
    
    // Exibe o problema na interface
    displayProblem(data.description, data.chatId, data.name);
    
    // Prepara dados para notificação
    const notificationData = {
        chatId: data.chatId,
        name: data.name,
        position: data.position,
        school: data.school,
        description: data.description,
        city: data.city
    };
    
    // Mostra notificação do novo problema
    showNotification('Novo Problema Relatado', notificationData);
});

// Handler do evento new-data
socket.on('new-data', (data) => {
    console.log('Novos dados recebidos:', data); // Log de novos dados
    updateUI(data);
});

// Handler do evento newProblemReported
socket.on('newProblemReported', (problemData) => {
    console.log('Novo problema relatado:', problemData); // Log de novo problema
    displayProblem(problemData.description, problemData.chatId, problemData.name);
    
    const notificationData = {
        description: problemData.description,
    };
    
    showNotification('Novo Problema Relatado', notificationData);
});

// Adicionar novo listener para feedback após conexão socket
socket.on('feedbackReceived', (data) => {
    if (data && data.chatId) {
        // Remove chat from all lists immediately
        ['active-chat-list', 'waiting-list-container', 'problem-list-container'].forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                const chatItem = container.querySelector(`[data-chat-id="${data.chatId}"]`);
                if (chatItem) {
                    chatItem.remove();
                }
            }
        });

        // Force UI refresh
        fetchDataAndUpdateUI();
    }
});

// Update chatCompleted event listener
socket.on('chatCompleted', (data) => {
    if (data && data.chatId) {
        // Remove chat from all lists immediately
        ['active-chat-list', 'waiting-list-container', 'problem-list-container'].forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                const chatItem = container.querySelector(`[data-chat-id="${data.chatId}"]`);
                if (chatItem) {
                    chatItem.remove();
                }
            }
        });

        // Force UI refresh after a short delay
        setTimeout(() => {
            fetchDataAndUpdateUI();
        }, 500);
    }
});

// Atualizar caminhos de recursos de áudio
const notificationSound = document.getElementById('notification-sound');
const activeChatList = document.getElementById('active-chat-list');
const waitingListContainer = document.getElementById('waiting-list-container');
const problemListContainer = document.getElementById('problem-list-container');

// Funções de manipulação da interface
// Função principal para atualizar a interface do usuário
function updateUI(data) {
    // Processa e valida os dados recebidos
    const processedData = {
        activeChats: Array.isArray(data.activeChats) ? 
            // Remove duplicatas baseado no chatId
            data.activeChats.filter((chat, index, self) =>
                index === self.findIndex(t => t.chatId === chat.chatId)
            ) : [],
        waitingList: Array.isArray(data.waitingList) ? data.waitingList : [],
        problems: Array.isArray(data.problems) ? data.problems : []
    };

    // Atualiza cada seção da interface
    updateSection(processedData.activeChats, activeChatList, 'active');
    updateSection(processedData.waitingList, waitingListContainer, 'waiting', true);
    updateSection(processedData.problems, problemListContainer, 'problem');
}

// Exibir um problema relatado
function displayProblem(description, chatId, userName) {
    const emptyMessage = problemListContainer.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    const existingProblem = Array.from(problemListContainer.children).find(
        item => item.dataset.chatId === chatId
    );
    
    if (existingProblem) {
        // Atualizar descrição do problema existente
        const descriptionElement = existingProblem.querySelector('.problem-description');
        if (descriptionElement) {
            descriptionElement.textContent = formatText(description);
        }
        return;
    }
    
    const problemItem = document.createElement('div');
    problemItem.classList.add('chat-item', 'problem-item');
    problemItem.dataset.chatId = chatId;
    
    const content = `
        <div class="item-content">
            <div class="user-info">
                <strong>${formatText(userName)}</strong>
                <span class="status-badge problem">Problema</span>
            </div>
            <div class="problem-description-container">
                <i class="fas fa-exclamation-circle"></i>
                <span class="problem-description">${formatText(description)}</span>
            </div>
            <div class="action-buttons">
                <button class="btn btn-primary btn-sm attend-btn">
                    <i class="fas fa-headset"></i> Atender
                </button>
            </div>
        </div>
    `;
    
    problemItem.innerHTML = content;
    
    if (chatId) {
        problemItem.addEventListener('click', () => {
            window.electron.openWhatsAppChat(chatId);
        });
        problemItem.style.cursor = 'pointer';
    }
    
    const attendBtn = problemItem.querySelector('.attend-btn');
    if (attendBtn) {
        attendBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleAttendProblem({
                chatId: chatId,
                name: userName,
                description: description
            });
        });
    }
    
    problemListContainer.insertBefore(problemItem, problemListContainer.firstChild);
}

function updateSection(items, container, type, includePosition = false) {
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Carregando...</div>';

    setTimeout(() => {
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = `<div class="empty-message">Nenhum ${type === 'active' ? 'atendimento ativo' : 
                                  type === 'waiting' ? 'usuário na fila' : 
                                  'problema relatado'}.</div>`;
            return;
        }

        // Garantir que os itens na fila de espera tenham posição correta
        if (type === 'waiting') {
            items.forEach((item, index) => {
                item.queuePosition = index + 1;
            });
        }

        items.forEach(item => {
            const element = createItemElement(item, type, includePosition);
            container.appendChild(element);
        });
    }, 300);
}

function capitalize(str) {
    if (!str) return '';
    // Remove conversão para maiúsculo total, apenas capitaliza a primeira letra de cada palavra
    return str
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatText(str) {
    if (!str) return '';
    
    // Palavras que devem permanecer em maiúsculo
    const upperCaseWords = ['EMEIF', 'EMEF', 'EE'];
    
    // Palavras que devem permanecer em minúsculo (exceto se forem a primeira palavra)
    const lowerCaseWords = ['da', 'de', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'a', 'o', 'as', 'os'];

    return str.toLowerCase()
        .split(' ')
        .map((word, index) => {
            // Verifica se a palavra deve ficar em maiúsculo
            if (upperCaseWords.includes(word.toUpperCase())) {
                return word.toUpperCase();
            }
            
            // Se for uma preposição e não for a primeira palavra
            if (lowerCaseWords.includes(word) && index !== 0) {
                return word;
            }
            
            // Capitaliza a primeira letra
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' ')
        .trim();
}

function createItemElement(item, type, includePosition) {
    if (!item) {
        console.log('Item inválido:', item);
        return null;
    }

    console.log(`Criando elemento do tipo ${type}:`, item);
    const element = document.createElement('div');
    element.classList.add('chat-item', `${type}-item`);
    
    const safeItem = {
        name: formatText(item.name || ''),
        city: formatText(item.city || ''),
        position: formatText(item.position || ''),
        school: formatText(item.school || ''),
        description: formatText(item.description || ''),
        chatId: item.chatId || '',
        queuePosition: item.queuePosition || ''
    };

    let content = '';
    switch(type) {
        case 'active':
        case 'waiting':
            const badge = type === 'active' 
                ? '<span class="status-badge active">Em Atendimento</span>'
                : `<span class="queue-position">Posição ${safeItem.queuePosition}º</span>`;

            content = `
                <div class="item-content ${type}-chat">
                    <div class="user-info">
                        <strong>${safeItem.name}</strong>
                        ${badge}
                    </div>
                    <div class="details">
                        <span class="location">${capitalize(safeItem.city)}</span> • 
                        <span class="position">${capitalize(safeItem.position)}</span>
                    </div>
                    <div class="school-info">
                        <i class="fas fa-school"></i> ${capitalize(safeItem.school)}
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-danger btn-sm end-chat-btn">
                            <i class="fas fa-times-circle"></i> Finalizar Atendimento
                        </button>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const endChatBtn = element.querySelector('.end-chat-btn');
                if (endChatBtn) {
                    endChatBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleEndChat(item);
                    });
                }
            }, 0);
            break;
        case 'problem':
            content = `
                <div class="item-content problem-chat">
                    <div class="problem-header">
                        <strong class="user-name">${safeItem.name}</strong>
                        <span class="status-badge problem">Problema</span>
                    </div>
                    <div class="problem-description-container">
                        <i class="fas fa-exclamation-circle"></i>
                        <span class="problem-description">${safeItem.description}</span>
                    </div>
                    <div class="action-buttons">
                        <button class="btn btn-primary btn-sm attend-btn">
                            <i class="fas fa-headset"></i> Atender
                        </button>
                    </div>
                </div>
            `;
            if (safeItem.chatId) {
                element.addEventListener('click', () => {
                    window.electron.openWhatsAppChat(safeItem.chatId);
                });
                element.style.cursor = 'pointer';
            }
            break;
    }
    
    element.innerHTML = content;
    
    if (type === 'problem') {
        const attendBtn = element.querySelector('.attend-btn');
        if (attendBtn) {
            attendBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                handleAttendProblem(item);
            });
        }
    }
    
    return element;
}

// Função para manipular o atendimento de um problema
async function handleAttendProblem(problem) {
    try {
        // Verifica se já existe um chat ativo com este chatId
        const existingActiveChat = Array.from(activeChatList.children)
            .find(item => item.dataset.chatId === problem.chatId);
        
        if (existingActiveChat) {
            // Se já existe um chat ativo, apenas remove o card do problema
            const problemCard = Array.from(problemListContainer.children)
                .find(item => item.dataset.chatId === problem.chatId);
            if (problemCard) {
                problemCard.remove();
            }
            
            // Abre o chat do WhatsApp
            let whatsappId = problem.chatId;
            if (!whatsappId.includes('@')) {
                whatsappId = `${whatsappId}@c.us`;
            }
            await window.electronAPI.openWhatsAppChat(whatsappId);
            return;
        }

        const modal = new bootstrap.Modal(document.getElementById('attendantModal'));
        
        // Request updated attendant list before showing modal
        socket.emit('getAttendants');
        
        modal.show();

        return new Promise((resolve, reject) => {
            const confirmBtn = document.getElementById('confirmAttendBtn');
            const attendantSelect = document.getElementById('attendantSelect');
            const attendantInput = document.getElementById('attendantName');
            const otherAttendantGroup = document.getElementById('otherAttendantGroup');

            // Mostrar/ocultar campo de input baseado na seleção
            attendantSelect.addEventListener('change', () => {
                otherAttendantGroup.style.display = 
                    attendantSelect.value === 'outro' ? 'block' : 'none';
                if (attendantSelect.value !== 'outro') {
                    attendantInput.value = '';
                }
            });
            
            const handleConfirm = async () => {
                let attendantName = attendantSelect.value;
                
                if (attendantName === 'outro') {
                    attendantName = attendantInput.value.trim();
                    if (!attendantName) {
                        alert('Por favor, insira o nome do atendente');
                        return;
                    }
                }

                modal.hide();
                confirmBtn.removeEventListener('click', handleConfirm);

                try {
                    console.log('Iniciando atendimento para:', problem);

                    // Remove o card do problema antes de emitir o evento
                    const problemCard = Array.from(problemListContainer.children)
                        .find(item => item.dataset.chatId === problem.chatId);
                    if (problemCard) {
                        problemCard.remove();
                    }

                    // Adiciona mensagem vazia se não houver mais problemas
                    if (problemListContainer.children.length === 0) {
                        problemListContainer.innerHTML = '<div class="empty-message">Nenhum problema relatado.</div>';
                    }

                    // Emitir evento com dados corretos
                    socket.emit('attendProblem', {
                        chatId: problem.chatId,
                        attendantName: attendantName, 
                        problemDescription: problem.description
                    });

                    await new Promise(resolve => setTimeout(resolve, 500));

                    let whatsappId = problem.chatId;
                    if (!whatsappId.includes('@')) {
                        whatsappId = `${whatsappId}@c.us`;
                    }

                    await window.electronAPI.openWhatsAppChat(whatsappId);
                    resolve();
                } catch (error) {
                    console.error('Erro ao abrir chat:', error);
                    alert('Erro ao abrir chat do WhatsApp. Por favor, tente novamente.');
                    reject(error);
                }
            };

            confirmBtn.addEventListener('click', handleConfirm);
            
            document.getElementById('attendantModal').addEventListener('hidden.bs.modal', () => {
                attendantSelect.value = 'Júnior Araújo'; 
                otherAttendantGroup.style.display = 'none';
                attendantInput.value = '';
                confirmBtn.removeEventListener('click', handleConfirm);
                resolve();
            }, { once: true });
        });
    } catch (error) {
        console.error('Erro ao atender problema:', error);
        alert('Erro ao iniciar atendimento. Por favor, tente novamente.');
    }
}

// Função para finalizar um atendimento
async function handleEndChat(chat) {
    try {
        const modal = new bootstrap.Modal(document.getElementById('endChatModal'));
        const cardCreatedSelect = document.getElementById('cardCreatedSelect');
        const cardLinkGroup = document.getElementById('cardLinkGroup');
        const cardLinkInput = document.getElementById('cardLink');
        const confirmEndBtn = document.getElementById('confirmEndBtn');

        cardCreatedSelect.value = 'no';
        cardLinkGroup.style.display = 'none';
        cardLinkInput.value = '';

        cardCreatedSelect.addEventListener('change', () => {
            cardLinkGroup.style.display = 
                cardCreatedSelect.value === 'yes' ? 'block' : 'none';
            if (cardCreatedSelect.value === 'no') {
                cardLinkInput.value = '';
            }
        });

        const handleConfirm = async () => {
            if (cardCreatedSelect.value === 'yes' && !cardLinkInput.value.trim()) {
                alert('Por favor, insira o link do card');
                return;
            }

            modal.hide();

            try {
                // Criar card primeiro se necessário
                let cardInfo = null;
                if (cardCreatedSelect.value === 'yes') {
                    // Fazer requisição para criar o card
                    const response = await fetch('http://localhost:3000/api/problem-cards/create', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            callId: chat.id,
                            cardLink: cardLinkInput.value.trim()
                        })
                    });

                    if (!response.ok) {
                        throw new Error('Falha ao criar card');
                    }

                    cardInfo = await response.json();
                }

                // Emitir evento de finalização com dados do card
                socket.emit('endChat', { 
                    chatId: chat.chatId, 
                    id: chat.id,
                    cardData: cardInfo
                });

                // Remover da UI imediatamente
                ['active-chat-list', 'waiting-list-container', 'problem-list-container'].forEach(containerId => {
                    const container = document.getElementById(containerId);
                    if (container) {
                        const chatItem = container.querySelector(`[data-chat-id="${chat.chatId}"]`);
                        if (chatItem) {
                            chatItem.remove();
                        }
                    }
                });

                fetchDataAndUpdateUI();

            } catch (error) {
                console.error('Erro ao finalizar atendimento:', error);
                alert('Erro ao finalizar atendimento. Por favor, tente novamente.');
            }
        };

        confirmEndBtn.addEventListener('click', handleConfirm);
        modal.show();

    } catch (error) {
        console.error('Erro ao finalizar atendimento:', error);
        alert('Erro ao finalizar atendimento. Por favor, tente novamente.');
    }
}

// Buscar dados do banco de dados SQLite e atualizar a UI
async function fetchDataAndUpdateUI() {
    try {
        const response = await fetch('http://localhost:3000/getProblemsData');
        if (!response.ok) {
            throw new Error(`Erro HTTP! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Dados recebidos do servidor:', data);
        updateUI(data);
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
    }
}

// Inicialização e carregamento
document.addEventListener('DOMContentLoaded', () => {
    fetchDataAndUpdateUI();
});

// Modal HTML
const modalHTML = `
<div id="attendantModal" class="modal fade custom-modal" tabindex="-1" style="display: none;">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="fas fa-headset"></i>
                    Iniciar Atendimento
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="attendantSelect">Selecione o Atendente:</label>
                    <select class="form-control" id="attendantSelect">
                        <option value="">Carregando atendentes...</option>
                    </select>
                </div>
                <div class="form-group mt-3" id="otherAttendantGroup" style="display: none;">
                    <label for="attendantName">Nome do Atendente:</label>
                    <input type="text" class="form-control" id="attendantName" placeholder="Digite o nome do atendente">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-success" id="confirmAttendBtn">
                    <i class="fas fa-check"></i>
                    Confirmar
                </button>
            </div>
        </div>
    </div>
</div>`;

// Add socket listener for attendant list
socket.on('attendantList', (attendants) => {
    const attendantSelect = document.getElementById('attendantSelect');
    attendantSelect.innerHTML = ''; // Clear existing options
    
    // Add attendants from database
    attendants.forEach(attendant => {
        const option = document.createElement('option');
        option.value = attendant.name;
        option.textContent = attendant.name;
        attendantSelect.appendChild(option);
    });
    
    // Add 'outro' option at the end
    const outroOption = document.createElement('option');
    outroOption.value = 'outro';
    outroOption.textContent = 'Outro';
    attendantSelect.appendChild(outroOption);
});

document.body.insertAdjacentHTML('beforeend', modalHTML);

document.body.insertAdjacentHTML('beforeend', `
<div id="endChatModal" class="modal fade custom-modal" tabindex="-1" style="display: none;">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">
                    <i class="fas fa-check-circle"></i>
                    Finalizar Atendimento
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="cardCreatedSelect">Foi necessário criar um card?</label>
                    <select class="form-control" id="cardCreatedSelect">
                        <option value="no">Não</option>
                        <option value="yes">Sim</option>
                    </select>
                </div>
                <div class="form-group mt-3" id="cardLinkGroup" style="display: none;">
                    <label for="cardLink">Link do Card:</label>
                    <input type="text" class="form-control" id="cardLink" placeholder="Cole o link do card aqui">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-success" id="confirmEndBtn">
                    <i class="fas fa-check"></i>
                    Confirmar
                </button>
            </div>
        </div>
    </div>
</div>`);
// Configuração do Socket.IO
const socket = io('http://localhost:3000');

// Elementos do DOM
const cardsContainer = document.getElementById('cardsContainer');
const statusFilter = document.getElementById('statusFilter');
const dateFilter = document.getElementById('dateFilter');
const applyFilterBtn = document.getElementById('applyFilter');

// Função principal para carregar cards
async function loadCards(filters = {}) {
    try {
        let url = 'http://localhost:3000/api/problem-cards';
        const params = new URLSearchParams();
        
        if (filters.status && filters.status !== 'all') {
            params.append('status', filters.status.toUpperCase());
        }
        if (filters.date) {
            params.append('date', filters.date);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        console.log('Fetching cards from:', url);
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        
        console.log('Cards loaded:', data);
        renderCards(data);
    } catch (error) {
        console.error('Erro ao carregar cards:', error);
        showError(`Falha ao carregar os cards: ${error.message}`);
    }
}

// Função para criar um novo card
async function createCard(cardData) {
    try {
        console.log('Tentando criar card:', cardData);
        
        if (!cardData.callId || !cardData.cardLink) {
            throw new Error('CallId e CardLink são obrigatórios');
        }

        const response = await fetch('http://localhost:3000/api/problem-cards/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                callId: cardData.callId,
                cardLink: cardData.cardLink
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erro ao criar card');
        }

        const data = await response.json();
        console.log('Card criado com sucesso:', data);
        
        // Recarrega a lista de cards
        await loadCards();
        
        return data;
    } catch (error) {
        console.error('Erro ao criar card:', error);
        throw error;
    }
}

// Função para exibir erro
function showError(message) {
    cardsContainer.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            ${message}
        </div>`;
}

// Função para renderizar cards
function renderCards(cards) {
    console.log('Renderizando cards:', cards);
    cardsContainer.innerHTML = '';
    
    if (!Array.isArray(cards) || cards.length === 0) {
        cardsContainer.innerHTML = `
            <div class="empty-message">
                <i class="fas fa-inbox"></i>
                Nenhum card encontrado
            </div>`;
        return;
    }

    const cardsGrid = document.createElement('div');
    cardsGrid.className = 'cards-grid';
    
    cards.forEach(card => {
        const cardElement = createCardElement(card);
        cardsGrid.appendChild(cardElement);
    });

    cardsContainer.appendChild(cardsGrid);
}

// Função para criar elemento de card
function createCardElement(card) {
    if (!card || !card.id) {
        console.error('Card inválido:', card);
        return document.createElement('div');
    }
    
    const div = document.createElement('div');
    div.className = `card-item ${card.status?.toLowerCase() || 'pending'}`;
    div.dataset.id = card.id;

    const statusText = card.status === 'COMPLETED' ? 'Concluído' : 'Pendente';
    const statusClass = card.status === 'COMPLETED' ? 'status-completed' : 'status-pending';

    const createdDate = new Date(card.createdAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Format phone number for display
    const phoneNumber = card.chatId ? formatPhoneNumber(card.chatId) : 'N/A';

    div.innerHTML = `
        <div class="card-header">
            <span class="card-status ${statusClass}">${statusText}</span>
            <div class="card-title">Card #${card.id}</div>
        </div>
        <div class="card-body">
            <div class="card-info">
                <div class="info-row">
                    <i class="fas fa-phone"></i>
                    <span class="phone-number">${phoneNumber}</span>
                </div>
                <div class="info-row">
                    <i class="fas fa-calendar"></i>
                    <span>Criado em ${createdDate}</span>
                </div>
            </div>
            <div class="card-actions">
                ${card.status !== 'COMPLETED' ? `
                    <button class="btn btn-success btn-sm" onclick="markAsCompleted(${card.id})">
                        <i class="fas fa-check"></i>
                        Concluir
                    </button>
                ` : `
                    <button class="btn btn-warning btn-sm" onclick="reopenCard(${card.id})">
                        <i class="fas fa-redo"></i>
                        Reabrir
                    </button>
                `}
                <a href="${card.link}" target="_blank" class="btn btn-primary btn-sm">
                    <i class="fas fa-external-link-alt"></i>
                    Ver Card
                </a>
            </div>
        </div>
    `;

    // Add click handler to phone number to open WhatsApp chat
    const phoneElement = div.querySelector('.phone-number');
    if (phoneElement && card.chatId) {
        phoneElement.style.cursor = 'pointer';
        phoneElement.title = 'Clique para abrir chat no WhatsApp';
        phoneElement.addEventListener('click', () => {
            window.electronAPI.openWhatsAppChat(card.chatId);
        });
    }

    return div;
}

// Adicionar função para reabrir card
async function reopenCard(cardId) {
    try {
        const response = await fetch(`http://localhost:3000/api/problem-cards/${cardId}/reopen`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }

        const updatedCard = await response.json();
        
        // Atualiza o card na interface
        const cardElement = document.querySelector(`[data-id="${cardId}"]`);
        if (cardElement) {
            cardElement.replaceWith(createCardElement(updatedCard));
        }

        // Notifica outros clientes via Socket.IO
        socket.emit('cardUpdated', updatedCard);
    } catch (error) {
        console.error('Erro ao reabrir card:', error);
        alert('Erro ao reabrir o card. Por favor, tente novamente.');
    }
}

// Função para marcar card como concluído
async function markAsCompleted(cardId) {
    try {
        const response = await fetch(`http://localhost:3000/api/problem-cards/${cardId}/complete`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const updatedCard = await response.json();
        
        // Atualiza o card na interface
        const cardElement = document.querySelector(`[data-id="${cardId}"]`);
        if (cardElement) {
            cardElement.replaceWith(createCardElement(updatedCard));
        }

        // Notifica outros clientes via Socket.IO
        socket.emit('cardUpdated', updatedCard);
    } catch (error) {
        console.error('Erro ao marcar card como concluído:', error);
        alert('Erro ao concluir o card. Por favor, tente novamente.');
    }
}

async function handleEndChat(chat) {
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
            if (cardCreatedSelect.value === 'yes') {
                const cardData = {
                    chatId: chat.chatId,
                    cardLink: cardLinkInput.value.trim(),
                    callId: chat.id // Include callId in cardData
                };
                
                console.log('Enviando dados do card:', cardData);
                socket.emit('createCard', cardData);
            }

            socket.emit('endChat', {
                chatId: chat.chatId,
                id: chat.id,
                cardCreated: cardCreatedSelect.value === 'yes'
            });

            // Remove o item da lista
            const problemItem = document.querySelector(`[data-chatid="${chat.chatId}"]`);
            if (problemItem) {
                problemItem.remove();
            }

        } catch (error) {
            console.error('Erro ao finalizar atendimento:', error);
            alert('Erro ao finalizar o atendimento. Por favor, tente novamente.');
        }
    };

    confirmEndBtn.addEventListener('click', handleConfirm);
    modal.show();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log('Iniciando gerenciamento de cards...');
    loadCards();
    
    // Atualização automática a cada 30 segundos
    setInterval(() => {
        const currentFilters = {
            status: statusFilter.value,
            date: dateFilter.value
        };
        loadCards(currentFilters);
    }, 30000);
});

// Filtros com event listener corrigido
applyFilterBtn.addEventListener('click', () => {
    const filters = {
        status: statusFilter.value,
        date: dateFilter.value
    };
    console.log('Applying filters:', filters);
    loadCards(filters);
});

function formatPhoneNumber(number) {
    // Remove WhatsApp format
    const cleaned = number.split('@')[0];
    
    // Remove country code (55) from the beginning
    const withoutCountry = cleaned.startsWith('55') ? cleaned.slice(2) : cleaned;
    
    // Format as (XX) 9XXXX-XXXX, ensuring the 9 is always present
    if (withoutCountry.length >= 8) {
        const ddd = withoutCountry.slice(0, 2);
        const mainNumber = withoutCountry.slice(2);
        return `(${ddd}) 9${mainNumber.slice(0, 4)}-${mainNumber.slice(4)}`;
    }
    
    return number;
}
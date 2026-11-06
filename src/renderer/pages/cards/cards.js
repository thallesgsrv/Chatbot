import { initSidebar } from '../../shared/sidebar.js';
import { api } from '../../shared/api.js';
import { on } from '../../shared/realtime.js';
import { SocketEvents, CardStatus } from '../../shared/protocol.js';
import { html, setHtml, safeUrl, $ } from '../../shared/dom.js';
import { formatPhone, toChatId } from '../../shared/format.js';
import { showToast } from '../../shared/toast.js';

const container = $('#cardsContainer');
const statusFilter = $('#statusFilter');
const dateFilter = $('#dateFilter');

const formatDate = (value) =>
    new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const cardTemplate = (card) => {
    const done = card.status === CardStatus.COMPLETED;
    const link = safeUrl(card.link);

    return html`
    <div class="card-item ${done ? 'completed' : 'pending'}" data-id="${card.id}">
        <div class="card-header">
            <span class="card-status ${done ? 'status-completed' : 'status-pending'}">${done ? 'Concluído' : 'Pendente'}</span>
            <div class="card-title">Card #${card.id}</div>
        </div>
        <div class="card-body">
            <div class="card-info">
                <div class="info-row">
                    <i class="fas fa-phone"></i>
                    ${card.chatId
                        ? html`<span class="phone-number" style="cursor:pointer" title="Clique para abrir chat no WhatsApp"
                                     data-action="open-chat" data-chat-id="${card.chatId}">${formatPhone(card.chatId)}</span>`
                        : html`<span class="phone-number">N/A</span>`}
                </div>
                <div class="info-row"><i class="fas fa-calendar"></i><span>Criado em ${formatDate(card.createdAt)}</span></div>
            </div>
            <div class="card-actions">
                ${done
                    ? html`<button class="btn btn-warning btn-sm" data-action="reopen"><i class="fas fa-redo"></i> Reabrir</button>`
                    : html`<button class="btn btn-success btn-sm" data-action="complete"><i class="fas fa-check"></i> Concluir</button>`}
                ${link ? html`<a href="${link}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">
                    <i class="fas fa-external-link-alt"></i> Ver Card</a>` : ''}
            </div>
        </div>
    </div>`;
};

async function loadCards() {
    try {
        const cards = await api.cards({ status: statusFilter.value, date: dateFilter.value });
        setHtml(container, cards.length
            ? html`<div class="cards-grid">${cards.map(cardTemplate)}</div>`
            : html`<div class="empty-message"><i class="fas fa-inbox"></i> Nenhum card encontrado</div>`);
    } catch (error) {
        setHtml(container, html`<div class="error-message"><i class="fas fa-exclamation-circle"></i> Falha ao carregar os cards: ${error.message}</div>`);
    }
}

async function openWhatsApp(chatId) {
    try {
        if (window.electronAPI) await window.electronAPI.openWhatsAppChat(toChatId(chatId));
        else window.open(`https://wa.me/${toChatId(chatId).replace(/\D/g, '')}`, '_blank', 'noopener');
    } catch (_) {
        showToast('Não foi possível abrir o WhatsApp.', 'error');
    }
}

container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    const row = target && target.closest('[data-id]');
    if (!row) return;

    try {
        switch (target.dataset.action) {
            case 'complete': await api.completeCard(row.dataset.id); break;
            case 'reopen': await api.reopenCard(row.dataset.id); break;
            case 'open-chat': return openWhatsApp(target.dataset.chatId);
        }
        // o servidor também avisa pelo socket; recarregar aqui mantém os filtros aplicados
        await loadCards();
    } catch (error) {
        showToast(`Erro ao atualizar o card: ${error.message}`, 'error');
    }
});

$('#applyFilter').addEventListener('click', loadCards);
on(SocketEvents.CARD_CREATED, loadCards);
on(SocketEvents.CARD_UPDATED, loadCards);

initSidebar();
loadCards();

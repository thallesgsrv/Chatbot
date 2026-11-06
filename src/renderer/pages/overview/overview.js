import { initSidebar } from '../../shared/sidebar.js';
import { api } from '../../shared/api.js';
import { on, emit } from '../../shared/realtime.js';
import { SocketEvents } from '../../shared/protocol.js';
import { html, setHtml, $ } from '../../shared/dom.js';
import { formatName, formatSchoolName, formatPosition, toChatId } from '../../shared/format.js';
import { showToast } from '../../shared/toast.js';
import { askAttendant, askEndChat } from './modals.js';

const containers = {
    active: $('#active-chat-list'),
    waiting: $('#waiting-list-container'),
    problem: $('#problem-list-container'),
};
const EMPTY = {
    active: 'Nenhum atendimento ativo.',
    waiting: 'Nenhum usuário na fila.',
    problem: 'Nenhum problema relatado.',
};

/** Último retrato recebido; os cliques procuram o item aqui pelo id do atendimento. */
let snapshot = { activeChats: [], waitingList: [], problems: [] };
let attendantNames = [];

// ---------------------------------------------------------------- renderização

const chatItem = (item, kind) => {
    const badge = kind === 'active'
        ? html`<span class="status-badge active">Em Atendimento</span>`
        : html`<span class="queue-position">Posição ${item.queuePosition}º</span>`;

    return html`
    <div class="chat-item ${kind}-item" data-chat-id="${item.chatId}" data-call-id="${item.id}">
        <div class="item-content ${kind}-chat">
            <div class="user-info"><strong>${formatName(item.name)}</strong> ${badge}</div>
            <div class="details">
                <span class="location">${formatName(item.city)}</span> •
                <span class="position">${formatPosition(item.position)}</span>
            </div>
            <div class="school-info"><i class="fas fa-school"></i> ${formatSchoolName(item.school)}</div>
            <div class="action-buttons">
                <button class="btn btn-danger btn-sm" data-action="end-chat">
                    <i class="fas fa-times-circle"></i> Finalizar Atendimento
                </button>
            </div>
        </div>
    </div>`;
};

const problemItem = (item) => html`
    <div class="chat-item problem-item" data-chat-id="${item.chatId}" data-call-id="${item.id}"
         ${item.chatId ? html`style="cursor:pointer" data-action="open-chat"` : ''}>
        <div class="item-content problem-chat">
            <div class="problem-header">
                <strong class="user-name">${formatName(item.name)}</strong>
                <span class="status-badge problem">Problema</span>
            </div>
            <div class="problem-description-container">
                <i class="fas fa-exclamation-circle"></i>
                <span class="problem-description">${item.description}</span>
            </div>
            <div class="action-buttons">
                <button class="btn btn-primary btn-sm" data-action="attend">
                    <i class="fas fa-headset"></i> Atender
                </button>
            </div>
        </div>
    </div>`;

function renderSection(kind, items, template) {
    setHtml(
        containers[kind],
        items.length ? html`${items.map(template)}` : html`<div class="empty-message">${EMPTY[kind]}</div>`
    );
}

function render(data) {
    snapshot = {
        // um mesmo chat não aparece duas vezes em "ativos"
        activeChats: (data.activeChats || []).filter((c, i, all) => i === all.findIndex((t) => t.chatId === c.chatId)),
        waitingList: data.waitingList || [],
        problems: data.problems || [],
    };
    renderSection('active', snapshot.activeChats, (c) => chatItem(c, 'active'));
    renderSection('waiting', snapshot.waitingList, (c) => chatItem(c, 'waiting'));
    renderSection('problem', snapshot.problems, problemItem);
}

// ---------------------------------------------------------------------- ações

const findItem = (callId) =>
    [...snapshot.activeChats, ...snapshot.waitingList, ...snapshot.problems].find((i) => String(i.id) === String(callId));

async function openWhatsApp(chatId) {
    const id = toChatId(chatId);
    try {
        if (window.electronAPI) await window.electronAPI.openWhatsAppChat(id);
        else window.open(`https://wa.me/${id.replace(/\D/g, '')}`, '_blank', 'noopener');
    } catch (error) {
        showToast('Não foi possível abrir o WhatsApp.', 'error');
    }
}

async function attendProblem(problem) {
    emit(SocketEvents.GET_ATTENDANTS);
    const names = await new Promise((resolve) => {
        const off = on(SocketEvents.ATTENDANT_LIST, (list) => { off(); resolve(list.map((a) => a.name)); });
        setTimeout(() => { off(); resolve(attendantNames); }, 1500); // se o servidor demorar, usa o que já tem
    });
    attendantNames = names;

    const attendantName = await askAttendant(names);
    if (!attendantName) return;

    emit(SocketEvents.ATTEND_PROBLEM, { chatId: problem.chatId, attendantName });
    await openWhatsApp(problem.chatId);
}

async function endChat(chat) {
    const answer = await askEndChat();
    if (!answer) return;

    try {
        if (answer.cardLink) await api.createCard(chat.id, answer.cardLink);
        emit(SocketEvents.END_CHAT, { chatId: chat.chatId });
    } catch (error) {
        showToast(`Erro ao finalizar atendimento: ${error.message}`, 'error');
    }
}

function handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const row = target.closest('[data-call-id]');
    const item = row && findItem(row.dataset.callId);
    if (!item) return;

    switch (target.dataset.action) {
        case 'attend': event.stopPropagation(); attendProblem(item); break;
        case 'end-chat': event.stopPropagation(); endChat(item); break;
        case 'open-chat': openWhatsApp(item.chatId); break;
    }
}

function notifyNewProblem(problem) {
    const title = 'Novo Problema Relatado';
    const body = `${formatName(problem.name)}${problem.school ? ` — ${formatSchoolName(problem.school)}` : ''}`;
    showToast(`${title}: ${body}`, 'warning');
    try {
        if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
        else if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch (_) { /* notificações do sistema indisponíveis */ }
}

// ----------------------------------------------------------------- inicialização

initSidebar();
Object.values(containers).forEach((container) => container.addEventListener('click', handleClick));

on(SocketEvents.STATUS_UPDATE, render);
on(SocketEvents.USER_PROBLEM, notifyNewProblem);
on(SocketEvents.SERVER_ERROR, ({ message }) => showToast(message, 'error'));

api.status().then(render).catch((error) => showToast(`Erro ao carregar dados: ${error.message}`, 'error'));

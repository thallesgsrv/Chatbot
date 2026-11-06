import { initSidebar } from '../../shared/sidebar.js';
import { api } from '../../shared/api.js';
import { html, setHtml, $ } from '../../shared/dom.js';
import { showToast } from '../../shared/toast.js';

const activeList = $('.active-contacts');
const ignoredList = $('.ignored-contacts');
const search = $('#searchContact');
const saveBtn = $('#saveBtn');

let contacts = [];
let ignored = new Set();
let changed = new Set(); // ids alterados desde o último salvamento (destaque visual)

const lastMessage = (seconds) =>
    new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(seconds * 1000);

const contactTemplate = (c) => html`
    <div class="contact-item${changed.has(c.id) ? ' changed' : ''}${ignored.has(c.id) ? ' ignored' : ''}">
        <input type="checkbox" id="${c.id}" data-id="${c.id}" ${ignored.has(c.id) ? 'checked' : ''}>
        <label for="${c.id}">
            <div class="contact-avatar"><i class="fas fa-user"></i></div>
            <div class="contact-info">
                <span class="contact-name">${c.name || 'Sem nome'}</span>
                <span class="contact-number">${c.number || 'Número indisponível'}</span>
                ${c.description ? html`<span class="contact-description">${c.description}</span>` : ''}
                ${c.lastMessageTime ? html`<span class="last-message-time">Última mensagem: ${lastMessage(c.lastMessageTime)}</span>` : ''}
            </div>
        </label>
    </div>`;

const emptyTemplate = (icon, text) => html`<div class="no-contacts"><i class="fas ${icon}"></i><p>${text}</p></div>`;

function render() {
    const term = search.value.trim().toLowerCase();
    const matches = contacts
        .filter((c) => [c.name, c.number, c.description].some((v) => (v || '').toLowerCase().includes(term)))
        .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0) || (a.name || '').localeCompare(b.name || ''));

    const empty = !contacts.length
        ? emptyTemplate('fa-users-slash', 'Nenhum contato encontrado.')
        : emptyTemplate('fa-search', `Nenhum contato encontrado para "${search.value}"`);

    const split = (isIgnored) => matches.filter((c) => ignored.has(c.id) === isIgnored);
    const fill = (container, items) => setHtml(container, items.length ? html`${items.map(contactTemplate)}` : empty);

    fill(activeList, split(false));
    fill(ignoredList, split(true));

    setHtml($('#activeHeader'), html`<i class="fas fa-users"></i> Contatos Ativos (${contacts.length - ignored.size})`);
    setHtml($('#ignoredHeader'), html`<i class="fas fa-user-slash"></i> Contatos Ignorados (${ignored.size})`);
}

async function load() {
    setHtml(activeList, html`<div class="loading">Carregando contatos...</div>`);
    setHtml(ignoredList, html`<div class="loading">Carregando contatos...</div>`);
    try {
        const data = await api.contacts();
        contacts = data.contacts || [];
        ignored = new Set(data.ignored || []);
        changed = new Set();
        render();
        showToast(`${contacts.length} contatos carregados`);
    } catch (error) {
        const retry = html`<div class="error-message"><i class="fas fa-exclamation-circle"></i> Erro ao carregar contatos.
            <button class="btn btn-link" data-action="retry" type="button">Tentar novamente</button></div>`;
        setHtml(activeList, retry);
        setHtml(ignoredList, retry);
        showToast(`Erro ao carregar contatos: ${error.message}`, 'error');
    }
}

async function save() {
    saveBtn.disabled = true;
    setHtml(saveBtn, html`<i class="fas fa-spinner fa-spin"></i> Salvando...`);
    try {
        const selected = contacts.filter((c) => ignored.has(c.id)).map(({ id, description }) => ({ id, description }));
        const result = await api.saveIgnoredContacts(selected);
        changed = new Set();
        render();
        showToast(`Alterações salvas: ${result.added} adicionados, ${result.removed} removidos`);
    } catch (error) {
        showToast(`Erro ao salvar alterações: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
        setHtml(saveBtn, html`<i class="fas fa-save"></i> Salvar Alterações`);
    }
}

// Marcar/desmarcar só altera o estado local; "Salvar" grava no banco
document.addEventListener('change', (event) => {
    const box = event.target.closest('input[type="checkbox"][data-id]');
    if (!box) return;
    if (box.checked) ignored.add(box.dataset.id); else ignored.delete(box.dataset.id);
    changed.add(box.dataset.id);
    render();
});
document.addEventListener('click', (event) => { if (event.target.closest('[data-action="retry"]')) load(); });
search.addEventListener('input', render);
$('#refreshBtn').addEventListener('click', load);
saveBtn.addEventListener('click', save);

initSidebar();
load();

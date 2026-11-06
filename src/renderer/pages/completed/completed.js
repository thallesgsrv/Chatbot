import { initSidebar } from '../../shared/sidebar.js';
import { api } from '../../shared/api.js';
import { html, setHtml, $ } from '../../shared/dom.js';
import { formatName, formatSchoolName, formatPosition, formatDuration } from '../../shared/format.js';
import { showToast } from '../../shared/toast.js';

const list = $('#completed-list');
const filters = { date: $('#filterDate'), position: $('#filterPosition'), attendant: $('#filterAttendant') };

const itemTemplate = (a) => html`
    <div class="completed-item">
        <div class="user-info-section">
            <div class="user-name">${formatName(a.name) || 'Sem nome'}</div>
            <div class="user-details"><i class="fas fa-user-tag"></i> ${formatPosition(a.position) || 'Não informado'}</div>
            <div class="user-details"><i class="fas fa-map-marker-alt"></i> ${formatName(a.school && a.school.client) || 'Não informado'}</div>
            <div class="user-details"><i class="fas fa-school"></i> ${formatSchoolName(a.school && a.school.name) || 'Não informado'}</div>
            <div class="user-details"><i class="fas fa-headset"></i> Atendente: ${(a.attendant && formatName(a.attendant.name)) || 'Bot'}</div>
        </div>
        <div class="problem-section">
            <div class="problem-title">Problema Relatado</div>
            <div class="problem-description">${a.description || 'Sem descrição'}</div>
        </div>
        <div class="time-section">
            <div class="time-info"><i class="fas fa-clock"></i> Início<br><strong>${a.date || 'Data não registrada'}</strong></div>
            <div class="time-info"><i class="fas fa-check-circle"></i> Conclusão<br><strong>${a.date_completed || 'Data não registrada'}</strong></div>
            <div class="duration-badge"><i class="fas fa-hourglass-end"></i> ${formatDuration(a.duration_minutes, { verbose: true })}</div>
        </div>
    </div>`;

function render(attendances) {
    setHtml(list, attendances.length
        ? html`${attendances.map(itemTemplate)}`
        : html`<div class="no-results">Nenhum atendimento concluído encontrado.</div>`);
}

async function load() {
    try {
        render(await api.completedAttendances({
            date: filters.date.value, position: filters.position.value, attendant: filters.attendant.value,
        }));
    } catch (error) {
        render([]);
        showToast(`Erro ao carregar atendimentos: ${error.message}`, 'error');
    }
}

/** Preenche os filtros de cargo e atendente (o atendente usa o id; "Bot" para os sem atendente). */
async function loadFilterOptions() {
    try {
        const [positions, all] = await Promise.all([api.positions(), api.completedAttendances()]);

        setHtml(filters.position, html`<option value="">Todos os cargos</option>${positions.map((p) => html`<option value="${p}">${formatPosition(p)}</option>`)}`);

        const attendants = new Map();
        all.forEach(({ attendant }) => attendants.set(attendant.id ?? 'Bot', attendant.name));
        setHtml(filters.attendant, html`<option value="">Todos os atendentes</option>${[...attendants].map(([value, name]) => html`<option value="${value}">${formatName(name)}</option>`)}`);
    } catch (error) {
        showToast(`Erro ao carregar filtros: ${error.message}`, 'error');
    }
}

Object.values(filters).forEach((input) => input.addEventListener('change', load));

initSidebar();
loadFilterOptions();
load();

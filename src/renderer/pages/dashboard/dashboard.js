import { initSidebar } from '../../shared/sidebar.js';
import { api } from '../../shared/api.js';
import { setHtml, html, $ } from '../../shared/dom.js';
import { formatName, formatSchoolName } from '../../shared/format.js';
import { showToast } from '../../shared/toast.js';
import { createCharts } from './charts.js';

const clientFilter = $('#clientFilter');
const schoolFilter = $('#schoolFilter');
const overlay = $('#reportOverlay');

const optionsHtml = (placeholder, items) =>
    html`<option value="">${placeholder}</option>${items.map(({ value, label }) => html`<option value="${value}">${label}</option>`)}`;

async function loadClients() {
    try {
        const clients = await api.clients();
        setHtml(clientFilter, optionsHtml('Todos os clientes', clients.map((c) => ({ value: c, label: formatName(c) }))));
    } catch (error) {
        showToast(`Erro ao carregar clientes: ${error.message}`, 'error');
    }
}

async function loadSchools(client) {
    setHtml(schoolFilter, optionsHtml('Todas as escolas', []));
    if (!client) return;
    try {
        const schools = await api.schools(client);
        setHtml(schoolFilter, optionsHtml('Todas as escolas', schools.map((s) => ({ value: s.id, label: formatSchoolName(s.name) }))));
    } catch (error) {
        showToast(`Erro ao carregar escolas: ${error.message}`, 'error');
    }
}

// ---------------------------------------------------------------- relatório

const openOverlay = () => { overlay.style.display = 'flex'; };
const closeOverlay = () => { overlay.style.display = 'none'; };

async function generateReport() {
    const start = $('#startDate').value;
    const end = $('#endDate').value;
    const format = $('input[name="reportFormat"]:checked').value;

    if (!start || !end) return showToast('Por favor, selecione as datas de início e fim.', 'warning');
    if (start > end) return showToast('A data inicial não pode ser posterior à data final.', 'warning');

    try {
        const blob = await api.reportBlob({ start, end, format, city: clientFilter.value, school: schoolFilter.value });
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: `Relatório-${start}-a-${end}.${format}` });
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        closeOverlay();
    } catch (error) {
        showToast(`Erro ao gerar relatório: ${error.message}`, 'error');
    }
}

// ------------------------------------------------------------- inicialização

initSidebar();
const charts = createCharts();

async function refreshCharts() {
    try {
        charts.update(await api.chartData({ client: clientFilter.value, school: schoolFilter.value }));
    } catch (error) {
        showToast(`Erro ao carregar os gráficos: ${error.message}`, 'error');
    }
}

clientFilter.addEventListener('change', () => loadSchools(clientFilter.value));
$('#applyFilter').addEventListener('click', refreshCharts);
$('#openReport').addEventListener('click', openOverlay);
$('#cancelReport').addEventListener('click', closeOverlay);
$('#generateReport').addEventListener('click', generateReport);
overlay.addEventListener('click', (event) => { if (event.target === overlay) closeOverlay(); });

// recolore os gráficos quando o tema muda
new MutationObserver(() => charts.applyTheme()).observe(document.body, { attributes: true, attributeFilter: ['class'] });

await loadClients();
await refreshCharts();
charts.applyTheme();

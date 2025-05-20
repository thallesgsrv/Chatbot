document.addEventListener('DOMContentLoaded', async () => {
    // Theme initialization
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const icon = document.querySelector('.theme-toggle i');
        const text = document.querySelector('.theme-toggle span');
        icon.classList.replace('fa-moon', 'fa-sun');
        text.textContent = 'Modo Claro';
    }

    // Initialize components
    Sidebar.init();
    Charts.init();
    await loadClients();
    
    // Event listeners
    document.getElementById('clientFilter').addEventListener('change', async (e) => {
        await loadSchools(e.target.value);
    });
    
    document.querySelector('.apply-filter-btn').addEventListener('click', applyFilters);
    document.querySelector('.report-container button').onclick = showReportOverlay;
    
    // Load initial data
    await fetchDataAndUpdateCharts();
});

async function fetchDataAndUpdateCharts(client = '', school = '') {
    try {
        const params = new URLSearchParams();
        if (client) params.append('client', client);
        if (school) params.append('school', school);
        
        const response = await fetch(`http://localhost:3000/api/statistics/getChartData?${params}`);
        if (!response.ok) throw new Error('Erro na resposta do servidor');
        
        const data = await response.json();
        if (!data || !data.weekly || !data.monthly) {
            throw new Error('Dados inválidos recebidos');
        }

        Charts.updateData(data.weekly, data.monthly);
        Charts.updateTheme(document.body.classList.contains('dark-theme'));
    } catch (error) {
        console.error('Erro ao buscar dados dos gráficos:', error);
    }
}

function toggleSidebar() {
    Sidebar.toggleSidebar();
    document.querySelector('.content').classList.toggle('collapsed');
}

function showReportOverlay() {
    document.getElementById('reportOverlay').style.display = 'flex';
}

function closeReportOverlay() {
    document.getElementById('reportOverlay').style.display = 'none';
}

function generateReport() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const format = document.querySelector('input[name="reportFormat"]:checked').value;
    const city = document.getElementById('cityFilter').value;
    const school = document.getElementById('schoolFilter').value;

    if (!startDate || !endDate) {
        alert('Por favor, selecione as datas de início e fim.');
        return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
        alert('A data inicial não pode ser posterior à data final.');
        return;
    }

    const params = new URLSearchParams({
        start: startDate,
        end: endDate,
        format: format,
        city: city,
        school: school
    });

    fetch(`http://localhost:3000/api/reports/generateReport?${params}`)
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `relatorio-${startDate}-${endDate}.${format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            closeReportOverlay();
        })
        .catch(error => {
            console.error('Erro ao gerar relatório:', error);
            alert('Erro ao gerar relatório. Tente novamente.');
        });
}

function toggleTheme() {
    Sidebar.toggleTheme();
}

async function loadClients() {
    try {
        const response = await fetch('/api/filters/getClients');
        const data = await response.json();
        
        const clientFilter = document.getElementById('clientFilter');
        clientFilter.innerHTML = '<option value="">Todos os clientes</option>';
        
        data.forEach(client => {
            if (client) {
                const option = document.createElement('option');
                option.value = client;
                option.textContent = client;
                clientFilter.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
    }
}

async function loadSchools(client = '') {
    try {
        const schoolFilter = document.getElementById('schoolFilter');
        schoolFilter.innerHTML = '<option value="">Todas as escolas</option>';
        
        if (!client) return;
        
        const response = await fetch(`/api/filters/getSchools?client=${encodeURIComponent(client)}`);
        const schools = await response.json();
        
        schools.forEach(school => {
            const option = document.createElement('option');
            option.value = school.id;
            option.textContent = school.name;
            schoolFilter.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar escolas:', error);
    }
}

async function applyFilters() {
    const client = document.getElementById('clientFilter').value;
    const school = document.getElementById('schoolFilter').value;
    
    await fetchDataAndUpdateCharts(client, school);
}
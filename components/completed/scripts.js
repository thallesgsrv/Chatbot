async function loadAttendants() {
    try {
        const response = await fetch('http://localhost:3000/api/statistics/getCompletedAttendances');
        const attendances = await response.json();
        const uniqueAttendants = [...new Set(attendances.map(a => a.attendant))].filter(Boolean);
        
        const filterAttendant = document.getElementById('filterAttendant');
        uniqueAttendants.forEach(attendant => {
            if (!filterAttendant.querySelector(`option[value="${attendant}"]`)) {
                const option = document.createElement('option');
                option.value = attendant;
                option.textContent = attendant;
                filterAttendant.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Erro ao carregar atendentes:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    Sidebar.init();
    loadCompletedAttendances();
    loadAttendants();
});

function toggleSidebar() {
    Sidebar.toggleSidebar();
    document.querySelector('.content').classList.toggle('collapsed');
}

function toggleTheme() {
    Sidebar.toggleTheme();
}

function deleteSelected() {
    const checkboxes = document.querySelectorAll('.completed-item input[type="checkbox"]:checked');
    checkboxes.forEach(checkbox => {
        const chatId = checkbox.dataset.chatId;
        window.electron.deleteCompletedAttendance(chatId);
        checkbox.closest('.completed-item').remove();
    });
}

async function loadCompletedAttendances() {
    try {
        console.log('Fetching completed attendances...');
        const response = await fetch('http://localhost:3000/api/statistics/getCompletedAttendances');
        console.log('Response status:', response.status);
        const completedAttendances = await response.json();
        console.log('Received attendances:', completedAttendances);
        displayCompletedAttendances(completedAttendances);
    } catch (error) {
        console.error('Erro ao carregar atendimentos:', error);
        displayCompletedAttendances([]);
    }
}

function formatDate(dateString) {
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Fortaleza',
    };
    return new Date(dateString).toLocaleString('pt-BR', options);
}

function calculateDuration(durationMinutes) {
    if (durationMinutes < 60) {
        return `${durationMinutes} minutos`;
    }
    
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    
    if (hours < 24) {
        return `${hours}h ${minutes}min`;
    }
    
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h ${minutes}min`;
}

function formatText(text, type = 'default') {
    if (!text) return '';
    
    // Don't format descriptions
    if (type === 'description') return text;
    
    // Special handling for school names
    if (type === 'school') {
        // Split the text into words
        return text.split(' ').map(word => {
            // Keep known acronyms in uppercase
            if (/^(EMEF|EMEIF||EMEIEF|EE|CEI|CMEI|EM)$/i.test(word)) {
                return word.toUpperCase();
            }
            // Regular word capitalization
            return word.toLowerCase().replace(/^[a-z]/, c => c.toUpperCase());
        }).join(' ');
    }
    
    // Regular text formatting for other types
    return text.toLowerCase().split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Update display functions to use the new formatText
function displayCompletedAttendances(attendances) {
    const completedList = document.getElementById('completed-list');
    completedList.innerHTML = '';

    if (!attendances || attendances.length === 0) {
        completedList.innerHTML = '<div class="no-results">Nenhum atendimento concluído encontrado.</div>';
        return;
    }

    attendances.forEach(attendance => {
        const duration = calculateDuration(attendance.duration_minutes || 0);
        
        const item = document.createElement('div');
        item.className = 'completed-item';
        item.innerHTML = `
            <div class="user-info-section">
                <div class="user-name">${formatText(attendance.name) || 'Sem nome'}</div>
                <div class="user-details"><i class="fas fa-user-tag"></i> ${formatText(attendance.position) || 'Não informado'}</div>
                <div class="user-details"><i class="fas fa-map-marker-alt"></i> ${formatText(attendance.school?.client) || 'Não informado'}</div>
                <div class="user-details"><i class="fas fa-school"></i> ${formatText(attendance.school?.name, 'school') || 'Não informado'}</div>
                <div class="user-details"><i class="fas fa-headset"></i> Atendente: ${formatText(attendance.attendant?.name) || 'Bot'}</div>
            </div>
            
            <div class="problem-section">
                <div class="problem-title">Problema Relatado</div>
                <div class="problem-description">${formatText(attendance.description) || 'Sem descrição'}</div>
            </div>
            
            <div class="time-section">
                <div class="time-info">
                    <i class="fas fa-clock"></i> Início<br>
                    <strong>${attendance.date || 'Data não registrada'}</strong>
                </div>
                <div class="time-info">
                    <i class="fas fa-check-circle"></i> Conclusão<br>
                    <strong>${attendance.date_completed || 'Data não registrada'}</strong>
                </div>
                <div class="duration-badge">
                    <i class="fas fa-hourglass-end"></i> ${duration}
                </div>
            </div>
        `;
        completedList.appendChild(item);
    });

    console.log('Attendances displayed:', attendances.length);
}

async function applyFilters() {
    const date = document.getElementById('filterDate').value;
    const position = document.getElementById('filterPosition').value;
    const attendant = document.getElementById('filterAttendant').value;
    
    const filters = {};
    if (date) filters.date = date;
    if (position) filters.position = position;
    if (attendant) filters.attendant = attendant;
    
    try {
        const params = new URLSearchParams(filters);
        const response = await fetch(`http://localhost:3000/api/statistics/getCompletedAttendances?${params}`);
        const filteredAttendances = await response.json();
        displayCompletedAttendances(filteredAttendances);
    } catch (error) {
        console.error('Erro ao aplicar filtros:', error);
    }
}

async function filterByDate(date) {
    await applyFilters();
}

async function filterByPosition(position) {
    await applyFilters();
}

async function filterByAttendant(attendant) {
    await applyFilters();
}

async function fetchCompletedAttendances(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    const response = await fetch(`http://localhost:3000/api/statistics/getCompletedAttendances?${params}`);
    const data = await response.json();
    renderCompletedAttendances(data);
}

function renderCompletedAttendances(attendances) {
    const tbody = document.getElementById('completed-list-body');
    tbody.innerHTML = '';
    
    if (!attendances || attendances.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Nenhum atendimento encontrado</td></tr>';
        return;
    }

    attendances.forEach(att => {
        const schoolInfo = att.school || {};
        tbody.innerHTML += `
            <tr>
                <td>${att.date_completed || ''}</td>
                <td>${formatText(schoolInfo.client || '')}</td>
                <td>${formatText(schoolInfo.name || '', 'school')}</td>
                <td>${formatText(att.name || '')}</td>
                <td>${formatText(att.position || '')}</td>
                <td>${formatText(att.attendant?.name || 'Bot')}</td>
                <td>${att.description || ''}</td>
                <td>${att.duration_minutes || ''}</td>
            </tr>
        `;
    });
}

async function loadFilters() {
    try {
        // Load positions
        const positionsResponse = await fetch('http://localhost:3000/api/statistics/getPositions');
        const positions = await positionsResponse.json();
        const filterPosition = document.getElementById('filterPosition');
        filterPosition.innerHTML = '<option value="">Todos os cargos</option>';
        positions.forEach(position => {
            const option = document.createElement('option');
            option.value = position;
            option.textContent = formatText(position);
            filterPosition.appendChild(option);
        });

        // Load attendants - corrigido para não duplicar
        const attendantsResponse = await fetch('http://localhost:3000/api/statistics/getCompletedAttendances');
        const attendances = await attendantsResponse.json();
        
        // Usa Map para garantir atendentes únicos por ID
        const uniqueAttendants = new Map();
        attendances.forEach(att => {
            if (att.attendant && att.attendant.id) {
                uniqueAttendants.set(att.attendant.id, att.attendant);
            }
        });

        const filterAttendant = document.getElementById('filterAttendant');
        filterAttendant.innerHTML = '<option value="">Todos os atendentes</option><option value="Bot">Bot</option>';
        
        uniqueAttendants.forEach(attendant => {
            const option = document.createElement('option');
            option.value = attendant.id;
            option.textContent = formatText(attendant.name);
            filterAttendant.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar filtros:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    Sidebar.init();
    loadCompletedAttendances();
    loadFilters();
});
/** Cliente da API REST. Mesma origem do painel: não há URL chumbada nem CORS. */

async function request(path, { method = 'GET', body, query } = {}) {
    const url = new URL(`/api${path}`, window.location.origin);
    for (const [key, value] of Object.entries(query || {})) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        let message = `Erro ${response.status}`;
        try { message = (await response.json()).error || message; } catch (_) { /* corpo não-JSON */ }
        throw new Error(message);
    }
    return response;
}

const json = async (path, options) => (await request(path, options)).json();

export const api = {
    status: () => json('/status'),
    clients: () => json('/filters/clients'),
    schools: (client) => json('/filters/schools', { query: { client } }),
    chartData: (filters) => json('/statistics/chart-data', { query: filters }),
    completedAttendances: (filters) => json('/statistics/completed-attendances', { query: filters }),
    positions: () => json('/statistics/positions'),
    cards: (filters) => json('/cards', { query: filters }),
    createCard: (callId, cardLink) => json('/cards', { method: 'POST', body: { callId, cardLink } }),
    completeCard: (id) => json(`/cards/${id}/complete`, { method: 'PUT' }),
    reopenCard: (id) => json(`/cards/${id}/reopen`, { method: 'PUT' }),
    contacts: () => json('/contacts'),
    saveIgnoredContacts: (contacts) => json('/contacts/ignored', { method: 'PUT', body: { contacts } }),
    /** Baixa um relatório (Blob) */
    reportBlob: async (query) => (await request('/reports', { query })).blob(),
};

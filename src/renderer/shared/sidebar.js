import { applySavedTheme, toggleTheme } from './theme.js';

const LINKS = [
    { page: 'overview', href: '/pages/overview/', icon: 'fa-home', label: 'Visão Geral' },
    { page: 'cards', href: '/pages/cards/', icon: 'fa-tasks', label: 'Cards' },
    { page: 'dashboard', href: '/pages/dashboard/', icon: 'fa-chart-line', label: 'Dashboard' },
    { page: 'completed', href: '/pages/completed/', icon: 'fa-check-circle', label: 'Concluídos' },
    { page: 'contacts', href: '/pages/contacts/', icon: 'fa-user-slash', label: 'Contatos' },
];

const template = (currentPage) => `
<div class="sidebar collapsed">
    <div class="sidebar-header">
        <button class="sidebar-toggle" type="button" aria-label="Alternar menu"><i class="fas fa-bars-staggered"></i></button>
        <img src="/assets/logo.svg" alt="Logo" class="brand-logo" />
    </div>
    <nav class="sidebar-nav">
        <ul class="nav-links">
            ${LINKS.map((l) => `
            <li>
                <a href="${l.href}" id="${l.page}-link" class="nav-item${l.page === currentPage ? ' active' : ''}">
                    <div class="nav-icon"><i class="fas ${l.icon}"></i></div>
                    <span class="nav-text">${l.label}</span>
                </a>
            </li>`).join('')}
        </ul>
    </nav>
    <div class="sidebar-footer">
        <div class="theme-toggle" role="button" tabindex="0">
            <div class="nav-icon"><i class="fas fa-moon"></i></div>
            <span class="toggle-text">Modo Escuro</span>
        </div>
        <div class="admin-profile">
            <div class="admin-avatar"><img src="/assets/avatar.jpg" alt="Admin" class="admin-img"></div>
            <div class="admin-info">
                <span class="admin-name">Suporte</span>
                <span class="admin-role"><i class="fas fa-circle-check"></i> Administrador</span>
            </div>
        </div>
    </div>
</div>`;

/** Página atual pelo caminho: /pages/cards/ -> "cards". */
const currentPageName = () => window.location.pathname.split('/').filter(Boolean)[1] || '';

function setInteractive(sidebar, enabled) {
    sidebar.querySelectorAll('.nav-links a, .theme-toggle, .admin-profile').forEach((el) => {
        el.style.pointerEvents = enabled ? 'auto' : 'none';
        el.style.cursor = enabled ? 'pointer' : 'default';
    });
}

export function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.content');
    const icon = sidebar.querySelector('.sidebar-toggle i');

    const collapsed = sidebar.classList.toggle('collapsed');
    content?.classList.toggle('collapsed', collapsed);
    icon.classList.toggle('fa-bars-staggered', collapsed);
    icon.classList.toggle('fa-bars', !collapsed);
    // pequena espera para a animação antes de (des)ativar cliques
    setTimeout(() => setInteractive(sidebar, !collapsed), 150);
}

/** Monta o menu lateral e liga os botões. Chamar uma vez por página. */
export function initSidebar() {
    const container = document.getElementById('sidebar-container');
    container.innerHTML = template(currentPageName());

    const sidebar = container.querySelector('.sidebar');
    document.querySelector('.content')?.classList.add('collapsed'); // começa recolhido, como antes
    setInteractive(sidebar, false);

    sidebar.querySelector('.sidebar-toggle').addEventListener('click', toggleSidebar);
    document.querySelector('.header .toggle-btn')?.addEventListener('click', toggleSidebar);
    const themeToggle = sidebar.querySelector('.theme-toggle');
    themeToggle.addEventListener('click', toggleTheme);
    themeToggle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggleTheme(); });

    // Em telas pequenas, clicar fora recolhe o menu
    document.addEventListener('click', (event) => {
        if (window.innerWidth <= 768 && !sidebar.contains(event.target)) sidebar.classList.add('collapsed');
    });

    applySavedTheme();
}

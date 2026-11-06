/** Tema claro/escuro: guarda a escolha e sincroniza a janela do Electron (se houver). */
const KEY = 'theme';

export const isDark = () => document.body.classList.contains('dark-theme');

function paintToggle(dark) {
    const icon = document.querySelector('.theme-toggle i');
    const text = document.querySelector('.theme-toggle span');
    if (icon) { icon.classList.toggle('fa-sun', dark); icon.classList.toggle('fa-moon', !dark); }
    if (text) text.textContent = dark ? 'Modo Claro' : 'Modo Escuro';
}

async function syncWindow(theme) {
    try { await window.electronAPI?.setSystemTheme(theme); } catch (_) { /* fora do Electron */ }
}

export function applySavedTheme() {
    const dark = localStorage.getItem(KEY) === 'dark';
    document.body.classList.toggle('dark-theme', dark);
    paintToggle(dark);
    if (dark) syncWindow('dark');
}

export async function toggleTheme() {
    const dark = !isDark();
    document.body.classList.toggle('dark-theme', dark);
    localStorage.setItem(KEY, dark ? 'dark' : 'light');
    paintToggle(dark);
    await syncWindow(dark ? 'dark' : 'light');
}

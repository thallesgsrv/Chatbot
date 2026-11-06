'use strict';

const { ipcMain, nativeTheme, shell } = require('electron');
const { phoneDigits } = require('../shared/format');

const THEME_COLORS = { dark: '#343a40', light: '#ffffff' };

/** Registra os handlers de IPC. `getWindow` evita guardar referência global à janela. */
function registerIpc({ getWindow }) {
    ipcMain.handle('open-whatsapp-chat', async (event, chatId) => {
        const digits = phoneDigits(chatId);
        if (!digits) throw new Error('Número de telefone inválido.');
        await shell.openExternal(`https://wa.me/${digits}`);
        return true;
    });

    ipcMain.handle('set-system-theme', (event, theme) => {
        const safeTheme = theme === 'light' ? 'light' : 'dark';
        nativeTheme.themeSource = safeTheme;
        const win = getWindow();
        if (win) win.setBackgroundColor(THEME_COLORS[safeTheme]);
        return safeTheme;
    });
}

module.exports = { registerIpc };

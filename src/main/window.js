'use strict';

const path = require('path');
const { BrowserWindow, nativeTheme } = require('electron');

/**
 * Cria a janela principal carregando o painel servido pelo próprio backend.
 * Como a interface vem do mesmo servidor da API (mesma origem) a política de
 * segurança (CSP) é enviada pelo Express, sem 'unsafe-eval' e sem https: liberado.
 */
function createMainWindow({ url, isDev }) {
    nativeTheme.themeSource = 'dark';

    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        backgroundColor: '#343a40',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    win.setTitle('');

    const origin = new URL(url).origin;
    // A janela nunca navega para fora do painel nem abre janelas novas
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, target) => {
        if (new URL(target).origin !== origin) event.preventDefault();
    });

    win.loadURL(`${url}/`);
    if (isDev) win.webContents.openDevTools();
    return win;
}

module.exports = { createMainWindow };

'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const config = require('../config');
const { startBackend } = require('../backend');
const { createMainWindow } = require('./window');
const { registerIpc } = require('./ipc');

let backend = null;
let mainWindow = null;

// Uma única instância: abrir o app de novo só traz a janela existente para frente
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    app.whenReady().then(async () => {
        registerIpc({ getWindow: () => mainWindow });

        try {
            backend = await startBackend({ config });
        } catch (error) {
            console.error('[main] falha ao iniciar o backend:', error);
            dialog.showErrorBox('Não foi possível iniciar o iEscolar Bot', error.message || String(error));
            return app.quit();
        }

        mainWindow = createMainWindow({ url: backend.url, isDev: config.isDev });
        mainWindow.on('closed', () => { mainWindow = null; });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createMainWindow({ url: backend.url, isDev: config.isDev });
            }
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    let stopping = false;
    app.on('before-quit', (event) => {
        if (!backend || stopping) return;
        stopping = true;
        event.preventDefault();
        backend.stop().catch(() => {}).finally(() => app.exit(0));
    });
}

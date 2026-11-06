'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Única ponte entre a interface e o Electron. Só expõe o que a tela realmente
 * precisa e que NÃO pode ser feito pela API HTTP: abrir o WhatsApp no
 * navegador/app padrão e sincronizar o tema da janela.
 * (Contatos, relatórios etc. agora passam pela API REST.)
 */
contextBridge.exposeInMainWorld('electronAPI', {
    openWhatsAppChat: (chatId) => ipcRenderer.invoke('open-whatsapp-chat', chatId),
    setSystemTheme: (theme) => ipcRenderer.invoke('set-system-theme', theme),
});

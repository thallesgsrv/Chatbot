#!/usr/bin/env node
'use strict';

/**
 * Sobe só o backend + painel (sem Electron). Abra a URL no navegador.
 * Útil para desenvolver a interface. Use BOT_ENABLED=false para não abrir o WhatsApp.
 */
const { startBackend } = require('../src/backend');

startBackend()
    .then(({ url, stop }) => {
        console.log(`Painel disponível em ${url}`);
        const shutdown = () => stop().finally(() => process.exit(0));
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    })
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });

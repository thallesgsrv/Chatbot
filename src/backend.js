'use strict';

const defaultConfig = require('./config');
const { createDatabase } = require('./database');
const { createServices } = require('./services');
const { createBot } = require('./bot');
const { WhatsAppGateway, NullGateway } = require('./bot/whatsapp-gateway');
const { createServer } = require('./server/app');
const Realtime = require('./server/realtime');

/**
 * Raiz de composição: cria banco, serviços, bot e servidor e os liga.
 * É o único lugar que conhece todas as peças. Usado pelo Electron
 * (src/main), por `npm run serve` e pelos testes.
 *
 * @param {object} [options]
 * @param {object} [options.config]   substitui a configuração padrão (testes)
 * @param {object} [options.gateway]  gateway de WhatsApp alternativo (testes)
 * @returns {Promise<{ url: string, port: number, services: object, bot: object, stop: () => Promise<void> }>}
 */
async function startBackend({ config = defaultConfig, gateway } = {}) {
    if (config === defaultConfig) defaultConfig.assertValid();

    const { sequelize, models } = createDatabase(config.db);
    await sequelize.authenticate();
    await sequelize.sync(); // só cria tabelas que faltam; nunca altera as existentes

    const services = createServices({ models, sequelize, config });
    const realtime = new Realtime({ statusService: services.status });

    const whatsapp = gateway || (config.bot.enabled ? new WhatsAppGateway({ headless: config.bot.headless }) : new NullGateway());
    const bot = createBot({ config, services, realtime, gateway: whatsapp });

    const server = createServer({ config, services, attendance: bot.coordinator, gateway: whatsapp, realtime });
    const address = await server.listen();

    try {
        await whatsapp.start();
    } catch (error) {
        // O painel continua útil mesmo se o WhatsApp falhar ao iniciar
        console.error('[backend] falha ao iniciar o WhatsApp:', error);
    }

    const host = address.address === '::' || address.address === '0.0.0.0' ? 'localhost' : address.address;
    return {
        url: `http://${host}:${address.port}`,
        port: address.port,
        services,
        models,
        sequelize,
        bot,
        gateway: whatsapp,
        async stop() {
            await server.close();
            await sequelize.close();
        },
    };
}

module.exports = { startBackend };

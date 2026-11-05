'use strict';

const baseConfig = require('../src/config');
const { startBackend } = require('../src/backend');
const { NullGateway } = require('../src/bot/whatsapp-gateway');

/** Gateway falso: guarda o que o bot enviou e permite "digitar" como usuário. */
class FakeGateway extends NullGateway {
    constructor() {
        super();
        this.startedAt = Date.now() - 1000;
        this.handlers = [];
        this.closedHandlers = [];
        this.counter = 0;
    }
    onMessage(h) { this.handlers.push(h); }
    onChatClosed(h) { this.closedHandlers.push(h); }
    async listContacts() {
        return [{ id: '5583900000001@c.us', name: 'Fulano', number: '5583900000001', lastMessageTime: 1, unreadCount: 0 }];
    }
    textsTo(chatId) { return this.sent.filter((m) => m.chatId === chatId).map((m) => m.body); }
    lastTo(chatId) { return this.textsTo(chatId).at(-1); }
}

function testConfig(overrides = {}) {
    const dbName = process.env.TEST_DB_NAME || 'chatbot_test';
    if (!/test/i.test(dbName)) throw new Error('Por segurança os testes só rodam em bancos cujo nome contém "test".');

    return {
        ...baseConfig,
        server: { host: '127.0.0.1', port: 0 },
        db: {
            host: process.env.TEST_DB_HOST || 'localhost',
            port: Number(process.env.TEST_DB_PORT || 5432),
            name: dbName,
            user: process.env.TEST_DB_USER || 'postgres',
            pass: process.env.TEST_DB_PASS || 'admin',
            logging: false,
            timezone: 'America/Fortaleza',
        },
        bot: { ...baseConfig.bot, enabled: false, replyDelayMs: 0, maxActiveChats: 1, ...(overrides.bot || {}) },
    };
}

/** Sobe o backend completo num banco limpo, com dados mínimos. */
async function setup({ seedData = true, bot } = {}) {
    const config = testConfig({ bot });
    const gateway = new FakeGateway();

    // banco limpo
    const { createDatabase } = require('../src/database');
    const probe = createDatabase(config.db);
    await probe.sequelize.sync({ force: true });
    await probe.sequelize.close();

    const backend = await startBackend({ config, gateway });
    const seed = seedData ? await seedBasics(backend.models) : {};

    /** O usuário escreve `body`; espera o bot terminar de responder. */
    const say = async (chatId, body, extra = {}) => {
        gateway.counter += 1;
        const message = { id: `m${gateway.counter}`, chatId, body, fromMe: false, isGroup: false, timestampMs: Date.now(), ...extra };
        for (const h of gateway.handlers) await h(message);
        await backend.bot.messenger.idle();
        await new Promise((r) => setImmediate(r));
        await backend.bot.messenger.idle();
    };

    return { config, gateway, backend, seed, say, url: backend.url, stop: () => backend.stop() };
}

async function seedBasics(models) {
    const { School, User, Attendant } = models;
    const escolaA = await School.create({ inep: '111', client: 'CAMPINA GRANDE', name: 'EMEF JOSE DE ALENCAR', neighborhood: 'Centro', street: 'Rua A', number: '1' });
    const escolaB = await School.create({ inep: '222', client: 'CAMPINA GRANDE', name: 'EE MARIA DA PENHA', neighborhood: 'Bodocongo', street: 'Rua B', number: '2' });
    const escolaC = await School.create({ inep: '333', client: 'PATOS', name: 'CEI PEQUENO PRINCIPE', neighborhood: 'Centro', street: 'Rua C', number: '3' });

    const mk = async (name, identifier, type, schools, iescolarId) => {
        const user = await User.create({ name, identifier, type, iescolarId });
        await user.setSchools(schools);
        return user;
    };

    const ana = await mk('ANA PAULA SOUZA', '12345678900', 'PROFESSOR', [escolaA], 1);
    const bruno = await mk('BRUNO LIMA', '98765432100', 'SECRETARIO', [escolaA, escolaB], 2); // 2 escolas
    const carla1 = await mk('CARLA DIAS', '11122233344', 'PROFESSOR', [escolaC], 3);
    const carla2 = await mk('CARLA DIAS', '11122233344', 'RESPONSAVEL', [escolaB], 4); // 2 tipos
    const dora = await mk('DORA LUZ', '55566677788', 'PROFESSOR', [escolaA], 5);
    const eva = await mk('EVA REIS', '99900011122', 'PROFESSOR', [escolaA], 6);
    const attendant = await Attendant.create({ name: 'Atendente Teste' });

    return { escolaA, escolaB, escolaC, ana, bruno, carla1, carla2, dora, eva, attendant };
}

/** Conversa do usuário até chegar ao menu de problemas. */
async function login(ctx, chatId, cpf) {
    await ctx.say(chatId, 'oi');
    await ctx.say(chatId, 'sim');
    await ctx.say(chatId, cpf);
}

module.exports = { setup, FakeGateway, login, testConfig };

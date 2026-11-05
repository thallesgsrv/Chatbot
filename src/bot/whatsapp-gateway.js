'use strict';

/**
 * Único arquivo que conhece o `hydra-bot`. O resto do sistema fala com esta
 * interface: start(), sendText(), listContacts(), onMessage(), onChatClosed().
 * Isso permite testar todo o fluxo com um gateway falso e trocar de biblioteca
 * mexendo só aqui.
 */

/** Normaliza o timestamp (segundos, ms, string ou embutido no id) para ms. */
function normalizeTimestamp(msg) {
    if (!msg) return Date.now();

    const timestamp = msg.messageTimestamp || msg.timestamp;
    if (typeof timestamp === 'number') return timestamp < 1e12 ? timestamp * 1000 : timestamp;

    if (typeof msg.id === 'string') {
        const match = msg.id.match(/_(\d+)@/);
        if (match) {
            const extracted = parseInt(match[1], 10);
            if (!Number.isNaN(extracted)) return extracted;
        }
    }
    if (typeof timestamp === 'string') {
        const parsed = Date.parse(timestamp);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return Date.now();
}

/** Mensagem do hydra -> formato interno, independente da biblioteca. */
function toIncomingMessage(raw) {
    const result = raw.result || {};
    const chatId = String(result.chatId || '');
    return {
        id: result.id || result.messageId || null,
        chatId,
        body: typeof result.body === 'string' ? result.body : '',
        fromMe: Boolean(result.fromMe),
        isGroup: chatId.endsWith('@g.us'),
        timestampMs: normalizeTimestamp(result),
    };
}

/** Converte um chat do hydra em contato simples (ou null se for grupo/inválido). */
function toContact(chat) {
    if (!chat || !chat.id) return null;
    const id = chat.id;
    const isGroup = typeof id === 'string' ? id.includes('g.us') : (id.remote && id.remote.includes('g.us')) || id.server === 'g.us';
    if (isGroup) return null;

    let chatId;
    let number;
    if (typeof id === 'string') {
        chatId = id;
        number = id.split('@')[0];
    } else if (id.remote) {
        chatId = id.remote;
        number = id.remote.split('@')[0];
    } else if (id._serialized) {
        chatId = id._serialized;
        number = id.user;
    } else {
        chatId = `${id.user}@c.us`;
        number = id.user;
    }

    const rawTime = chat.lastMessageTime || chat.t;
    const lastMessageTime =
        rawTime && rawTime.toString().length === 13 ? Math.floor(rawTime / 1000) : rawTime || Math.floor(Date.now() / 1000);

    return {
        id: chatId,
        name: chat.name || (chat.contact && chat.contact.pushname) || number,
        number,
        lastMessageTime,
        unreadCount: chat.unreadCount || 0,
    };
}

class WhatsAppGateway {
    constructor({ headless = false } = {}) {
        this.headless = headless;
        this.conn = null;
        this.startedAt = null;
        this.messageHandlers = [];
        this.chatClosedHandlers = [];
    }

    onMessage(handler) {
        this.messageHandlers.push(handler);
    }

    onChatClosed(handler) {
        this.chatClosedHandlers.push(handler);
    }

    isConnected() {
        return Boolean(this.conn);
    }

    async start() {
        const hydraBot = require('hydra-bot'); // carregado só quando o bot está habilitado
        this.startedAt = Date.now();

        const bot = await hydraBot.initServer({
            puppeteerOptions: {
                headless: this.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        });
        console.log('[whatsapp] bot inicializado');

        bot.on('connection', (conn) => {
            if (!conn.connect) {
                console.error('[whatsapp] erro na conexão com o Hydra');
                return;
            }
            console.log('[whatsapp] conexão estabelecida');
            this.conn = conn;

            conn.client.ev.on('newMessage', (raw) => {
                const message = toIncomingMessage(raw);
                for (const handler of this.messageHandlers) {
                    Promise.resolve(handler(message)).catch((e) => console.error('[whatsapp] erro ao processar mensagem:', e));
                }
            });

            conn.client.ev.on('chatClosed', (chatId) => {
                if (String(chatId).endsWith('@g.us')) return;
                for (const handler of this.chatClosedHandlers) {
                    Promise.resolve(handler(chatId)).catch((e) => console.error('[whatsapp] erro em chatClosed:', e));
                }
            });
        });
    }

    async sendText(chatId, body) {
        if (!this.conn) throw new Error('WhatsApp não está conectado.');
        await this.conn.client.sendMessage({ to: chatId, body, options: { type: 'sendText' } });
    }

    async listContacts() {
        if (!this.conn) return [];
        try {
            const chats = await this.conn.client.getAllChats();
            if (!Array.isArray(chats)) return [];
            return chats
                .map((chat) => {
                    try { return toContact(chat); } catch (_) { return null; }
                })
                .filter(Boolean)
                .sort((a, b) => b.lastMessageTime - a.lastMessageTime);
        } catch (error) {
            console.error('[whatsapp] erro ao listar contatos:', error);
            return [];
        }
    }
}

/** Usado com BOT_ENABLED=false: o painel funciona, mas nada é enviado ao WhatsApp. */
class NullGateway {
    constructor() {
        this.sent = [];
        this.startedAt = Date.now();
    }
    onMessage() {}
    onChatClosed() {}
    isConnected() { return false; }
    async start() { console.log('[whatsapp] bot desabilitado (BOT_ENABLED=false)'); }
    async sendText(chatId, body) { this.sent.push({ chatId, body }); }
    async listContacts() { return []; }
}

module.exports = { WhatsAppGateway, NullGateway, normalizeTimestamp, toIncomingMessage, toContact };

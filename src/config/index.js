'use strict';

/**
 * Configuração central da aplicação.
 *
 * Tudo que antes estava "chumbado" no código (credenciais do banco, porta,
 * delays do bot) passa a vir de variáveis de ambiente, com defaults seguros.
 *
 * O arquivo .env é procurado, nesta ordem:
 *   1. caminho em CHATBOT_ENV_FILE
 *   2. diretório atual (cwd)
 *   3. raiz do projeto
 *   4. pasta de dados do usuário do Electron (app instalado no Windows)
 * Variáveis já definidas no ambiente nunca são sobrescritas pelo .env.
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

function candidateEnvFiles() {
    const files = [
        process.env.CHATBOT_ENV_FILE,
        path.join(process.cwd(), '.env'),
        path.join(ROOT_DIR, '.env'),
    ];

    try {
        // Fora do Electron, require('electron') devolve só o caminho do binário.
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            files.push(path.join(app.getPath('userData'), '.env'));
        }
    } catch (_) {
        /* não está rodando dentro do Electron */
    }

    return files.filter(Boolean);
}

function loadEnvFiles() {
    const loaded = [];
    for (const file of candidateEnvFiles()) {
        if (fs.existsSync(file)) {
            dotenv.config({ path: file });
            loaded.push(file);
        }
    }
    return loaded;
}

const loadedEnvFiles = loadEnvFiles();

const toBool = (value, fallback) =>
    value === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(value).trim());

const toInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const env = process.env.NODE_ENV || 'production';

const config = {
    env,
    isDev: env === 'development',
    loadedEnvFiles,

    paths: {
        root: ROOT_DIR,
        assets: path.join(ROOT_DIR, 'assets'),
        renderer: path.join(ROOT_DIR, 'src', 'renderer'),
        shared: path.join(ROOT_DIR, 'src', 'shared'),
        nodeModules: path.join(ROOT_DIR, 'node_modules'),
    },

    server: {
        // 127.0.0.1: o painel é local. Para expor na rede, defina SERVER_HOST=0.0.0.0
        host: process.env.SERVER_HOST || '127.0.0.1',
        port: toInt(process.env.SERVER_PORT || process.env.PORT, 3000),
    },

    db: {
        host: process.env.DB_HOST || 'localhost',
        port: toInt(process.env.DB_PORT, 5432),
        name: process.env.DB_NAME || 'chatbot',
        user: process.env.DB_USER || 'postgres',
        // Sem default de propósito: nada de senha escrita no código.
        pass: process.env.DB_PASS,
        logging: toBool(process.env.DB_LOGGING, false),
        // Fuso usado pelas funções de data do SQL (agrupamento por dia/mês).
        timezone: process.env.DB_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || '+00:00',
    },

    bot: {
        enabled: toBool(process.env.BOT_ENABLED, true),
        headless: toBool(process.env.BOT_HEADLESS, false),
        // Pausa antes das respostas do fluxo de problemas (parece mais natural)
        replyDelayMs: toInt(process.env.BOT_REPLY_DELAY_MS, 2000),
        // Mensagens idênticas dentro dessa janela são tratadas como duplicadas
        dedupeWindowMs: 2000,
        // Quantos usuários podem ser atendidos pelo bot ao mesmo tempo
        maxActiveChats: toInt(process.env.MAX_ACTIVE_CHATS, 1),
    },
};

/**
 * Valida o que é indispensável para subir. Lança um erro com instrução clara
 * em vez de deixar o driver do Postgres falhar com "SASL: password must be a string".
 */
function assertValid(cfg = config) {
    if (cfg.db.pass === undefined) {
        const searched = candidateEnvFiles().join('\n  - ');
        throw new Error(
            'DB_PASS não está definido.\n' +
                'Copie .env.example para .env e preencha as credenciais do PostgreSQL.\n' +
                `Locais onde o .env é procurado:\n  - ${searched}`
        );
    }
    return cfg;
}

module.exports = config;
module.exports.assertValid = assertValid;

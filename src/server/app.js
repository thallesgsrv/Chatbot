'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const createApiRouter = require('./routes');
const registerSockets = require('./sockets');
const { errorMiddleware } = require('./http-utils');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Monta Express + Socket.IO. Não chama `listen` aqui: quem cria decide quando
 * (e os testes sobem em porta aleatória).
 *
 * Mesma origem para tudo: o Express serve a interface e a API, então não há
 * CORS aberto nem URLs `http://localhost:3000` chumbadas no frontend.
 */
function createServer({ config, services, attendance, gateway, realtime }) {
    const app = express();
    const httpServer = http.createServer(app);
    const hostOf = (value) => String(value || '').replace(/:\d+$/, '').toLowerCase();
    const loopbackOnly = LOOPBACK.has(config.server.host);

    // Bloqueia Host desconhecido (proteção contra DNS rebinding) quando o servidor é local
    const isAllowedHost = (hostHeader) => !loopbackOnly || LOOPBACK.has(hostOf(hostHeader));

    const io = new Server(httpServer, {
        allowRequest: (req, callback) => {
            const origin = req.headers.origin;
            const ok = isAllowedHost(req.headers.host) && (!origin || hostOf(new URL(origin).host) === hostOf(req.headers.host));
            callback(null, ok);
        },
    });
    realtime.attach(io);

    app.disable('x-powered-by');
    app.use((req, res, next) => {
        if (!isAllowedHost(req.headers.host)) return res.status(403).end('Host não permitido');
        res.setHeader(
            'Content-Security-Policy',
            [
                "default-src 'self'",
                "script-src 'self'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data:",
                "font-src 'self'",
                `connect-src 'self' ws://${req.headers.host}`,
                "object-src 'none'",
                "base-uri 'self'",
            ].join('; ')
        );
        next();
    });
    app.use(express.json({ limit: '1mb' }));

    // --- Interface estática ---------------------------------------------
    const { renderer, shared, assets, nodeModules } = config.paths;
    const vendor = (name, ...segments) => app.use(`/vendor/${name}`, express.static(path.join(nodeModules, ...segments)));
    vendor('bootstrap', 'bootstrap', 'dist');
    vendor('fontawesome', '@fortawesome', 'fontawesome-free');
    vendor('inter', '@fontsource', 'inter');
    vendor('chartjs', 'chart.js', 'dist');
    app.use('/common', express.static(shared)); // protocol.js e format.js (UMD)
    app.use('/assets', express.static(assets));
    app.get('/', (req, res) => res.redirect('/pages/overview/'));
    app.use(express.static(renderer));

    // --- API --------------------------------------------------------------
    app.use('/api', createApiRouter({ services, realtime, gateway }));
    app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
    app.use(errorMiddleware);

    registerSockets({ io, services, attendance, realtime });

    return {
        app,
        io,
        httpServer,
        listen: () =>
            new Promise((resolve, reject) => {
                httpServer.once('error', reject);
                httpServer.listen(config.server.port, config.server.host, () => resolve(httpServer.address()));
            }),
        close: () =>
            new Promise((resolve) => {
                io.close(() => resolve());
            }),
    };
}

module.exports = { createServer };

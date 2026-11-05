'use strict';

/** Repassa erros de handlers async para o middleware de erro do Express. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Converte erros de domínio (status 4xx) em JSON; o resto vira 500 genérico. */
function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
    const status = err.status && err.status < 500 ? err.status : 500;
    if (status === 500) console.error(`[http] ${req.method} ${req.originalUrl}:`, err);
    res.status(status).json({ error: status === 500 ? 'Erro interno do servidor.' : err.message });
}

module.exports = { asyncHandler, errorMiddleware };

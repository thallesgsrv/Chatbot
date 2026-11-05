'use strict';

/** Erros de domínio. As rotas HTTP os convertem em 400/404; o resto vira 500. */
class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
    }
}

class ValidationError extends AppError {
    constructor(message) {
        super(message, 400);
    }
}

class NotFoundError extends AppError {
    constructor(message) {
        super(message, 404);
    }
}

module.exports = { AppError, ValidationError, NotFoundError };

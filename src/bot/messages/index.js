'use strict';

/** Textos do bot. Para alterar o que o bot diz, edite os .json desta pasta. */
const greetings = require('./greetings.json');
const dialogs = require('./dialogs.json');
const errors = require('./errors.json');
const finished = require('./finished.json');

/**
 * Menu de problemas: cada tópico tem número, rótulo, texto do submenu,
 * opções e (opcionalmente) um vídeo por opção.
 * Substitui 3 arquivos que precisavam ser editados juntos
 * (commands.json, problemMappings.json e dialogs.subProblems).
 */
const problemCatalog = require('./problem-catalog.json');

/** Substitui %s / %d em ordem, como no original (`"..%s".replace('%s', valor)`). */
function format(template, ...values) {
    let i = 0;
    return String(template).replace(/%[sd]/g, (match) => (i < values.length ? String(values[i++]) : match));
}

function randomWelcome() {
    const options = greetings.welcome;
    return Array.isArray(options) && options.length
        ? options[Math.floor(Math.random() * options.length)]
        : 'Olá! Para iniciar o atendimento, por favor digite seu CPF ou número de matrícula:';
}

module.exports = { greetings, dialogs, errors, finished, problemCatalog, format, randomWelcome };

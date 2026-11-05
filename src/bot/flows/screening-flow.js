'use strict';

const { Step } = require('../conversation-store');
const IdentityService = require('../../services/identity-service');
const { greetings, errors, format, randomWelcome } = require('../messages');

const YES = new Set(['sim']);
const NO = new Set(['não', 'nao']);

/** Aceita "1".."n" e devolve o índice (0-based) ou -1. */
function parseChoice(text, size) {
    const index = parseInt(text, 10) - 1;
    return index >= 0 && index < size ? index : -1;
}

const numbered = (items) => items.map((label, i) => `${i + 1} - ${label}`).join('\n');

/**
 * Triagem: termos -> CPF/matrícula -> (tipo de vínculo) -> (escola) -> abre o
 * atendimento e entra na fila ou segue para o menu de problemas.
 */
class ScreeningFlow {
    constructor({ store, messenger, identity, calls, queue, problemFlow, realtime }) {
        Object.assign(this, { store, messenger, identity, calls, queue, problemFlow, realtime });
    }

    say(chatId, text) {
        return this.messenger.send(chatId, text);
    }

    async start(chatId) {
        this.store.set(chatId, Step.PRIVACY);
        await this.say(chatId, greetings.guidelines);
        await this.say(chatId, greetings.aceptedguidelines);
    }

    async onPrivacy({ chatId, text }) {
        if (YES.has(text)) {
            this.store.set(chatId, Step.IDENTIFIER);
            return this.say(chatId, randomWelcome());
        }
        if (NO.has(text)) {
            this.store.clear(chatId);
            return this.say(chatId, greetings.guidelinesRejected);
        }
        return this.say(chatId, greetings.guidelinesInvalid);
    }

    async onIdentifier({ chatId, text }) {
        const digits = text.replace(/\D/g, '');
        if (digits.length < 5) return this.say(chatId, errors.invalidIdentifier);

        const users = await this.identity.findByIdentifier(digits);
        if (users.length === 0) return this.say(chatId, errors.userNotFound);

        const types = IdentityService.distinctTypes(users);
        if (types.length > 1) {
            this.store.set(chatId, Step.SELECT_TYPE, { types, users });
            return this.say(chatId, `${greetings.chooseType}${numbered(types)}`.trim());
        }
        return this.chooseSchool(chatId, users);
    }

    async onTypeSelection({ chatId, text, state }) {
        const index = parseChoice(text, state.types.length);
        if (index < 0) return this.say(chatId, errors.invalidOption);

        const type = state.types[index];
        return this.chooseSchool(chatId, state.users.filter((user) => user.type === type));
    }

    async chooseSchool(chatId, users) {
        const choices = IdentityService.buildSchoolChoices(users);

        if (choices.length === 0) {
            this.store.clear(chatId);
            return this.say(chatId, errors.noSchoolsFound);
        }
        if (choices.length === 1) return this.openCall(chatId, choices[0]);

        this.store.set(chatId, Step.SELECT_SCHOOL, { choices });
        return this.say(chatId, `${greetings.chooseSchool}${numbered(choices.map((c) => c.name))}`.trim());
    }

    async onSchoolSelection({ chatId, text, state }) {
        const index = parseChoice(text, state.choices.length);
        if (index < 0) return this.say(chatId, errors.invalidOption);
        return this.openCall(chatId, state.choices[index]);
    }

    /** Cria o atendimento; se não há vaga, o usuário entra na fila. */
    async openCall(chatId, choice) {
        const { queued, position } = await this.queue.admit(chatId, (status) =>
            this.calls.open({
                userId: choice.userIds[0],
                schoolId: choice.id,
                chatId,
                position: choice.userType,
                status,
            })
        );

        await this.say(chatId, format(greetings.confirmSchool, `${choice.name} - ${choice.client} (${choice.userType})`));

        if (queued) {
            this.store.set(chatId, Step.IN_QUEUE);
            await this.say(chatId, format(greetings.queueFirstNotification, position));
        } else {
            await this.problemFlow.showMenu(chatId);
        }
        await this.realtime.emitStatus();
    }
}

module.exports = ScreeningFlow;

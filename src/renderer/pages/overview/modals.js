import { $ } from '../../shared/dom.js';

/**
 * Os dois modais da página. Cada um devolve uma Promise com o que o usuário
 * escolheu (ou null se cancelou) e se limpa sozinho, sem acumular listeners a
 * cada abertura (o código antigo registrava um 'change' novo a cada clique).
 */

function show(id) {
    const element = document.getElementById(id);
    const modal = bootstrap.Modal.getOrCreateInstance(element);
    // O Bootstrap ignora hide() enquanto o modal ainda está animando a entrada; um clique rápido em
    // "Confirmar" deixaria o modal preso aberto. `closeWhenReady` espera a animação terminar.
    const shown = new Promise((resolve) => element.addEventListener('shown.bs.modal', resolve, { once: true }));
    const closeWhenReady = async () => { await shown; modal.hide(); };
    modal.show();
    return { element, modal, closeWhenReady };
}

/** @param {string[]} attendantNames  nomes já cadastrados */
export function askAttendant(attendantNames) {
    const select = $('#attendantSelect');
    const otherGroup = $('#otherAttendantGroup');
    const nameInput = $('#attendantName');
    const error = $('#attendantError');
    const confirm = $('#confirmAttendBtn');

    select.replaceChildren(
        ...[...attendantNames, 'outro'].map((name) => new Option(name === 'outro' ? 'Outro' : name, name))
    );
    nameInput.value = '';
    error.hidden = true;
    const syncOther = () => { otherGroup.hidden = select.value !== 'outro'; };
    syncOther();

    const { element, closeWhenReady } = show('attendantModal');

    return new Promise((resolve) => {
        const finish = (value) => {
            select.removeEventListener('change', syncOther);
            confirm.removeEventListener('click', onConfirm);
            element.removeEventListener('hidden.bs.modal', onHidden);
            resolve(value);
        };
        const onConfirm = () => {
            const name = select.value === 'outro' ? nameInput.value.trim() : select.value;
            if (!name) {
                error.textContent = 'Por favor, insira o nome do atendente.';
                error.hidden = false;
                return;
            }
            closeWhenReady();
            finish(name);
        };
        const onHidden = () => finish(null);

        select.addEventListener('change', syncOther);
        confirm.addEventListener('click', onConfirm);
        element.addEventListener('hidden.bs.modal', onHidden, { once: true });
    });
}

/** @returns {Promise<{ cardLink: string | null } | null>} */
export function askEndChat() {
    const select = $('#cardCreatedSelect');
    const group = $('#cardLinkGroup');
    const input = $('#cardLink');
    const error = $('#endChatError');
    const confirm = $('#confirmEndBtn');

    select.value = 'no';
    input.value = '';
    group.hidden = true;
    error.hidden = true;
    const syncLink = () => { group.hidden = select.value !== 'yes'; };

    const { element, closeWhenReady } = show('endChatModal');

    return new Promise((resolve) => {
        const finish = (value) => {
            select.removeEventListener('change', syncLink);
            confirm.removeEventListener('click', onConfirm);
            element.removeEventListener('hidden.bs.modal', onHidden);
            resolve(value);
        };
        const onConfirm = () => {
            const wantsCard = select.value === 'yes';
            const link = input.value.trim();
            if (wantsCard && !link) {
                error.textContent = 'Por favor, insira o link do card.';
                error.hidden = false;
                return;
            }
            closeWhenReady();
            finish({ cardLink: wantsCard ? link : null });
        };
        const onHidden = () => finish(null);

        select.addEventListener('change', syncLink);
        confirm.addEventListener('click', onConfirm);
        element.addEventListener('hidden.bs.modal', onHidden, { once: true });
    });
}

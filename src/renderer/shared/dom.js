/** Utilitários de DOM. `html` escapa automaticamente tudo que é interpolado. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Marca um trecho como HTML já seguro (resultado de outro `html`). */
class SafeHtml {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
}

/**
 * Template literal que escapa os valores interpolados.
 * Nomes, escolas e descrições vêm do WhatsApp (entrada de terceiros);
 * antes eram injetados direto em innerHTML (XSS).
 *   html`<b>${nome}</b>`   // nome é escapado
 *   html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`  // aninhado e arrays são aceitos
 */
export function html(strings, ...values) {
    const render = (value) => {
        if (value instanceof SafeHtml) return value.value;
        if (Array.isArray(value)) return value.map(render).join('');
        return escapeHtml(value);
    };
    return new SafeHtml(strings.reduce((out, str, i) => out + str + (i < values.length ? render(values[i]) : ''), ''));
}

/** Atribui um `html` (ou string de texto puro) ao elemento. */
export function setHtml(element, content) {
    element.innerHTML = content instanceof SafeHtml ? content.value : escapeHtml(content);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Só aceita http/https para uso em href (bloqueia javascript:). */
export function safeUrl(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (_) {
        return null;
    }
}

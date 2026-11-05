/**
 * Funções de formatação de texto compartilhadas (UMD).
 *
 * Antes existiam 3 cópias divergentes (renderer.js, completed/scripts.js,
 * routes/reports.js) e os relatórios formatavam diferente da tela.
 *
 * No Node:     const Format = require('../shared/format');
 * No browser:  <script src="/shared/format.js"> expõe window.Format
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Format = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    // Siglas de escola que devem ficar em maiúsculas
    const SCHOOL_ACRONYMS = new Set(['EMEF', 'EMEIF', 'EMEIEF', 'EE', 'CEI', 'CMEI', 'EM']);

    // Conectivos que ficam em minúsculas (exceto como primeira palavra)
    const LOWERCASE_WORDS = new Set([
        'da', 'de', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos',
        'para', 'por', 'com', 'a', 'o', 'as', 'os',
    ]);

    const USER_TYPE_LABELS = Object.freeze({
        ALUNO: 'Aluno',
        PROFESSOR: 'Professor',
        SECRETARIO: 'Secretário',
        ADMINISTRADOR: 'Administrador',
        RESPONSAVEL: 'Responsável',
        PEDAGOGO: 'Pedagogo',
        MOTORISTA: 'Motorista',
    });

    function titleCase(text, { acronyms = false } = {}) {
        if (text === null || text === undefined) return '';
        const words = String(text).trim().toLowerCase().split(/\s+/).filter(Boolean);

        return words
            .map((word, index) => {
                if (acronyms && SCHOOL_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
                if (index > 0 && LOWERCASE_WORDS.has(word)) return word;
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    const formatName = (name) => titleCase(name);
    const formatSchoolName = (name) => titleCase(name, { acronyms: true });

    function formatPosition(position) {
        if (!position) return '';
        return USER_TYPE_LABELS[position] || titleCase(position);
    }

    /** Só dígitos. Aceita '5583999990000@c.us', '(83) 99999-0000', etc. */
    function phoneDigits(value) {
        return String(value || '').replace('@c.us', '').replace(/\D/g, '');
    }

    /** Garante o formato de chat do WhatsApp: '<digitos>@c.us' */
    function toChatId(value) {
        const raw = String(value || '');
        if (raw.includes('@')) return raw;
        const digits = phoneDigits(raw);
        return digits ? `${digits}@c.us` : '';
    }

    /** '5583996080051@c.us' -> '(83) 99608-0051' */
    function formatPhone(chatIdOrNumber) {
        const original = String(chatIdOrNumber || '');
        const cleaned = original.split('@')[0];
        const withoutCountry = cleaned.startsWith('55') ? cleaned.slice(2) : cleaned;

        // DDD (2) + 8 dígitos (sem o nono) ou 9 dígitos (com o nono)
        if (withoutCountry.length === 10 || withoutCountry.length === 11) {
            const ddd = withoutCountry.slice(0, 2);
            let main = withoutCountry.slice(2);
            if (main.length === 8) main = `9${main}`; // número antigo: garante o nono dígito
            return `(${ddd}) ${main.slice(0, 5)}-${main.slice(5)}`;
        }
        return original;
    }

    /**
     * Duração em minutos para texto.
     *  compacto (relatórios): 45min | 1h30min | 2h
     *  verbose  (tela):       45 minutos | 1h 30min | 1d 2h 5min
     */
    function formatDuration(totalMinutes, { verbose = false } = {}) {
        const minutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));

        if (!verbose) {
            if (!minutes) return 'N/A';
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            if (h === 0) return `${m}min`;
            return m > 0 ? `${h}h${m}min` : `${h}h`;
        }

        if (minutes < 60) return `${minutes} minutos`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours < 24) return `${hours}h ${mins}min`;
        return `${Math.floor(hours / 24)}d ${hours % 24}h ${mins}min`;
    }

    return {
        titleCase,
        formatName,
        formatSchoolName,
        formatPosition,
        formatPhone,
        formatDuration,
        phoneDigits,
        toChatId,
        USER_TYPE_LABELS,
    };
});

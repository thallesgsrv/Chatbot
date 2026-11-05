'use strict';

const { ValidationError } = require('./errors');

/**
 * Datas "YYYY-MM-DD" vindas da interface representam DIAS NO FUSO LOCAL.
 *
 * O código antigo misturava `new Date('2025-01-15')` (meia-noite UTC) com
 * `new Date('2025-01-15 23:59:59')` (hora local), o que incluía as últimas
 * horas do dia anterior e, nos relatórios, excluía o último dia do período.
 */
function parseLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!match) throw new ValidationError(`Data inválida: "${value}". Use o formato AAAA-MM-DD.`);

    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(year, month - 1, day);
    const isRealDate =
        date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    if (!isRealDate) throw new ValidationError(`Data inexistente: "${value}".`);
    return date;
}

/** Início e fim (inclusive) do dia local. */
function dayRange(value) {
    const start = parseLocalDate(value);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
    return { start, end };
}

/** Do início do primeiro dia ao fim do último dia (ambos inclusivos). */
function periodRange(startValue, endValue) {
    const start = dayRange(startValue).start;
    const end = dayRange(endValue).end;
    if (start > end) throw new ValidationError('A data inicial não pode ser posterior à data final.');
    return { start, end };
}

/** Date -> 'YYYY-MM-DD' no fuso local (toISOString converteria para UTC). */
function toLocalDateKey(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = { parseLocalDate, dayRange, periodRange, toLocalDateKey };

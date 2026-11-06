#!/usr/bin/env node
'use strict';

/**
 * Importa usuários, escolas e telefones de um CSV (cabeçalho obrigatório).
 * Antes era um bloco comentado dentro de connection.js, ativado "na mão".
 *
 *   npm run import:csv -- caminho/dados.csv
 *
 * Colunas: type, iescolar_id, name, identifier, telephone,
 *          client, school_inep, school_name, school_neighborhood, school_street, school_number
 * Escolas são reaproveitadas pelo INEP; cada linha cria um registro de usuário
 * (o mesmo CPF pode ter várias linhas: uma por vínculo/escola). Tudo em uma
 * transação: se uma linha falhar, nada é gravado.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const config = require('../src/config');
const { createDatabase } = require('../src/database');
const { USER_TYPES } = require('../src/database/models/user');

async function importCsv(file, { models, sequelize }) {
    const { User, School, UserTelephone } = models;
    const records = parse(fs.readFileSync(file, 'utf-8'), { columns: true, trim: true, skip_empty_lines: true, bom: true });

    const invalid = records.findIndex((r) => !USER_TYPES.includes(r.type));
    if (invalid >= 0) {
        throw new Error(`Linha ${invalid + 2}: tipo "${records[invalid].type}" inválido. Use: ${USER_TYPES.join(', ')}`);
    }

    return sequelize.transaction(async (transaction) => {
        let users = 0;
        for (const record of records) {
            const [school] = await School.findOrCreate({
                where: { inep: record.school_inep || '' },
                defaults: {
                    client: record.client || '',
                    name: record.school_name || '',
                    neighborhood: record.school_neighborhood || '',
                    street: record.school_street || '',
                    number: record.school_number || '',
                },
                transaction,
            });

            const user = await User.create(
                { type: record.type, iescolarId: record.iescolar_id || 0, name: record.name || '', identifier: record.identifier || '' },
                { transaction }
            );
            if (record.telephone) {
                await UserTelephone.create({ userId: user.id, telephone: String(record.telephone) }, { transaction });
            }
            await user.addSchool(school, { transaction });
            users += 1;
        }
        return { users, schools: await School.count({ transaction }) };
    });
}

async function main() {
    const file = process.argv[2];
    if (!file) throw new Error('Informe o CSV: npm run import:csv -- caminho/dados.csv');
    if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${path.resolve(file)}`);

    config.assertValid();
    const db = createDatabase(config.db);
    try {
        await db.sequelize.sync();
        const result = await importCsv(file, db);
        console.log(`Importação concluída: ${result.users} usuários; ${result.schools} escolas no banco.`);
    } finally {
        await db.sequelize.close();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = { importCsv };

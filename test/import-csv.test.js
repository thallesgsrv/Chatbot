'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../src/database');
const { importCsv } = require('../scripts/import-users-csv');
const { testConfig } = require('./helpers');

const HEADER = 'type,iescolar_id,name,identifier,telephone,client,school_inep,school_name,school_neighborhood,school_street,school_number';

test('importação de CSV reaproveita escolas e é atômica', async () => {
    const db = createDatabase(testConfig().db);
    await db.sequelize.sync({ force: true });
    const file = path.join(os.tmpdir(), `import-${process.pid}.csv`);

    try {
        fs.writeFileSync(file, [
            HEADER,
            'PROFESSOR,10,Ana,12345678900,83999990000,CAMPINA,111,EMEF A,Centro,Rua 1,10',
            'SECRETARIO,11,Ana,12345678900,,CAMPINA,111,EMEF A,Centro,Rua 1,10',
            'ALUNO,12,Beto,,,CAMPINA,222,EE B,Centro,Rua 2,20',
        ].join('\n'));

        assert.deepEqual(await importCsv(file, db), { users: 3, schools: 2 });
        assert.equal(await db.models.User.count(), 3);
        assert.equal(await db.models.UserTelephone.count(), 1);
        const ana = await db.models.User.findAll({ where: { identifier: '12345678900' }, include: [{ model: db.models.School, as: 'schools' }] });
        assert.equal(ana.length, 2);
        assert.ok(ana.every((u) => u.schools.length === 1 && u.schools[0].inep === '111'));

        // tipo inválido: nada é gravado
        fs.writeFileSync(file, [HEADER, 'ALUNO,1,X,1,,C,333,S,B,R,1', 'ALIEN,2,Y,2,,C,444,T,B,R,2'].join('\n'));
        await assert.rejects(importCsv(file, db), /Linha 3: tipo "ALIEN" inválido/);
        assert.equal(await db.models.User.count(), 3);
    } finally {
        fs.rmSync(file, { force: true });
        await db.sequelize.close();
    }
});

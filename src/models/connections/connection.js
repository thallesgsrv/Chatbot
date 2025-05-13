const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'postgres',
    port: 5432,
    username: 'postgres',
    password: 'admin',
    host: 'localhost',
    database: 'chatbot'
});

/*async function importCsvData() {
    const User = require('../entities/user');
    const School = require('../entities/school');
    const UserTelephone = require('../entities/usertelephone');

    const csvFilePath = path.join(__dirname, 'dados bsr.csv');
    let noIdentifierCounter = 0;

    const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

    const createSchool = async (record, transaction) => {
        const [school] = await School.findOrCreate({
            where: { inep: record.school_inep || '' },
            defaults: {
                client: record.client || '',
                name: record.school_name || '',
                neighborhood: record.school_neighborhood || '',
                street: record.school_street || '',
                number: record.school_number || ''
            },
            transaction
        });
        return school;
    };

    const createUser = async (record, school, transaction) => {
        const user = await User.create({
            type: record.type,
            iescolarId: record.iescolar_id || 0,
            name: record.name || '',
            identifier: record.identifier || '',
        }, { transaction });

        if (record.telephone !== undefined) {
            await UserTelephone.create({
                idUser: user.id,
                telephone: String(record.telephone || '')
            }, { transaction });
        }

        if (school) {
            await user.addSchool(school, { transaction });
        }

        return user;
    };

    return new Promise((resolve, reject) => {
        parse(fileContent, {
            delimiter: ',',
            columns: true,
            trim: true,
            skipEmptyLines: false
        }, async (err, records) => {
            if (err) return reject(err);

            const transaction = await sequelize.transaction();
            try {
                for (const record of records) {
                    const school = await createSchool(record, transaction);
                    await createUser(record, school, transaction);
                }
                await transaction.commit();
                resolve();
            } catch (error) {
                await transaction.rollback();
                reject(error);
            }
        });
    });
}*/

module.exports = sequelize;
//module.exports.importCsvData = importCsvData;
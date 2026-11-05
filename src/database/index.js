'use strict';

/**
 * Ponto único de acesso ao banco: cria a conexão, registra os models e
 * declara TODAS as associações em um só lugar.
 *
 * Em vez de singletons importados por qualquer arquivo (o que gerava
 * dependências circulares e estado global), `createDatabase` devolve
 * { sequelize, models } e quem precisa recebe isso por injeção.
 */

const { Sequelize } = require('sequelize');

const defineAttendant = require('./models/attendant');
const defineSchool = require('./models/school');
const defineUser = require('./models/user');
const defineUserTelephone = require('./models/usertelephone');
const defineCreateCall = require('./models/createcall');
const defineCall = require('./models/call');
const defineCard = require('./models/card');
const defineDisableContact = require('./models/disablecontact');

function createSequelize(dbConfig) {
    return new Sequelize(dbConfig.name, dbConfig.user, dbConfig.pass, {
        dialect: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        timezone: dbConfig.timezone,
        logging: dbConfig.logging ? console.log : false,
    });
}

function defineModels(sequelize) {
    const Attendant = defineAttendant(sequelize);
    const School = defineSchool(sequelize);
    const User = defineUser(sequelize);
    const UserTelephone = defineUserTelephone(sequelize);
    const CreateCall = defineCreateCall(sequelize, { User, School });
    const Call = defineCall(sequelize);
    const Card = defineCard(sequelize);
    const DisableContact = defineDisableContact(sequelize, { Attendant });

    // Usuário <-> Escola (N:N). A tabela de junção "userschool" é criada pelo Sequelize.
    User.belongsToMany(School, {
        as: 'schools',
        through: 'userschool',
        foreignKey: 'userId',
        otherKey: 'schoolId',
        timestamps: false,
    });
    User.hasMany(UserTelephone, { foreignKey: 'userId' });

    CreateCall.belongsTo(User, { foreignKey: 'userId', as: 'user' });
    CreateCall.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

    Call.belongsTo(CreateCall, { foreignKey: 'createCallId', as: 'createcall' });
    Call.belongsTo(Attendant, { foreignKey: 'attendantId', as: 'attendant' });
    Call.hasOne(Card, { foreignKey: 'callId', as: 'card' });
    Card.belongsTo(Call, { foreignKey: 'callId', as: 'call' });

    DisableContact.belongsTo(Attendant, { foreignKey: 'attendantId', as: 'attendant' });

    return { Attendant, School, User, UserTelephone, CreateCall, Call, Card, DisableContact };
}

/**
 * @param {object} dbConfig  config.db
 * @returns {{ sequelize: Sequelize, models: object }}
 */
function createDatabase(dbConfig) {
    const sequelize = createSequelize(dbConfig);
    const models = defineModels(sequelize);
    return { sequelize, models };
}

module.exports = { createDatabase, defineModels, createSequelize };

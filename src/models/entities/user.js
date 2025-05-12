const School = require('./school.js')
const Call = require('./call.js')
const UserTelephone = require('./usertelephone.js')
const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');
const { fr } = require('date-fns/locale');

const User = sequelize.define(
    'user',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        identifier: {
            type: DataTypes.STRING,
            allowNull: true
        },
        iescolarId: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('ALUNO', 'PROFESSOR', 'SECRETARIO', 'ADMINISTRADOR', 'RESPONSAVEL', 'PEDAGOGO','MOTORISTA'),
            allowNull: false,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    },
);


// Associações
User.belongsToMany(School, { 
    through: 'userschool',
    foreignKey: 'idUser',
    otherKey: 'idSchool',
    timestamps: false,
})

User.hasMany(UserTelephone, {
    foreignKey: 'idUser'
});

// Exportações
module.exports = User

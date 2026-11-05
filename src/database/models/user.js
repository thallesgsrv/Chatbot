'use strict';
const { DataTypes } = require('sequelize');

const USER_TYPES = ['ALUNO', 'PROFESSOR', 'SECRETARIO', 'ADMINISTRADOR', 'RESPONSAVEL', 'PEDAGOGO', 'MOTORISTA'];

module.exports = (sequelize) =>
    sequelize.define(
        'user',
        {
            id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
            identifier: { type: DataTypes.STRING, allowNull: true }, // CPF / matrícula
            iescolarId: { type: DataTypes.BIGINT, allowNull: false },
            name: { type: DataTypes.STRING, allowNull: false },
            type: { type: DataTypes.ENUM(...USER_TYPES), allowNull: false },
        },
        { freezeTableName: true, timestamps: false }
    );

module.exports.USER_TYPES = USER_TYPES;

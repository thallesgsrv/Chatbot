'use strict';
const { DataTypes } = require('sequelize');

/** Registro de abertura de um atendimento: quem, qual escola, qual chat, quando. */
module.exports = (sequelize, { User, School }) =>
    sequelize.define(
        'createcall',
        {
            id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
            userId: {
                type: DataTypes.BIGINT,
                allowNull: false,
                references: { model: User, key: 'id' },
            },
            schoolId: {
                type: DataTypes.BIGINT,
                allowNull: false,
                references: { model: School, key: 'id' },
            },
            chatId: { type: DataTypes.STRING, allowNull: false },
            date: { type: DataTypes.DATE, allowNull: false },
        },
        { freezeTableName: true, timestamps: false }
    );

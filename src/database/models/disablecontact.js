'use strict';
const { DataTypes } = require('sequelize');

/** Contatos que o bot deve ignorar (ex.: números internos, fornecedores). */
module.exports = (sequelize, { Attendant }) =>
    sequelize.define(
        'disablecontact',
        {
            id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
            telephone: { type: DataTypes.STRING, allowNull: true },
            description: { type: DataTypes.STRING, allowNull: true },
            disableDate: { type: DataTypes.DATE, allowNull: false },
            attendantId: {
                type: DataTypes.BIGINT,
                allowNull: false,
                references: { model: Attendant, key: 'id' },
            },
        },
        { freezeTableName: true, timestamps: false }
    );

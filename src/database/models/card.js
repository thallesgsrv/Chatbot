'use strict';
const { DataTypes } = require('sequelize');
const { CardStatus } = require('../../shared/protocol');

/** Card externo (ex.: Trello) criado a partir de um atendimento. */
module.exports = (sequelize) =>
    sequelize.define(
        'card',
        {
            id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
            link: { type: DataTypes.STRING, allowNull: false },
            callId: { type: DataTypes.BIGINT, references: { model: 'call', key: 'id' } },
            status: {
                type: DataTypes.ENUM(...Object.values(CardStatus)),
                allowNull: false,
                defaultValue: CardStatus.PENDING,
            },
        },
        { freezeTableName: true, timestamps: true }
    );

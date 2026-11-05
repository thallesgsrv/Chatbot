'use strict';
const { DataTypes } = require('sequelize');
const { CallStatus } = require('../../shared/protocol');

module.exports = (sequelize) =>
    sequelize.define(
        'call',
        {
            id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
            description: { type: DataTypes.TEXT, allowNull: true },
            position: { type: DataTypes.STRING, allowNull: false }, // cargo do usuário no momento
            status: { type: DataTypes.ENUM(...Object.values(CallStatus)), allowNull: false },
            dateTimeFinish: { type: DataTypes.DATE },
            rating: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
            attendantId: { type: DataTypes.BIGINT, allowNull: true },
            createCallId: { type: DataTypes.BIGINT, allowNull: false },
        },
        { freezeTableName: true, timestamps: false }
    );

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
    sequelize.define(
        'attendant',
        {
            id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
            name: { type: DataTypes.STRING, allowNull: false, unique: true },
        },
        { freezeTableName: true, timestamps: false }
    );

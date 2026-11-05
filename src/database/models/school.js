'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
    sequelize.define(
        'school',
        {
            id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
            inep: { type: DataTypes.STRING, allowNull: false, unique: true },
            // "client" é o município/cliente dono da escola
            client: { type: DataTypes.STRING, allowNull: false },
            name: { type: DataTypes.STRING, allowNull: false },
            neighborhood: { type: DataTypes.STRING, allowNull: false },
            street: { type: DataTypes.STRING, allowNull: false },
            number: { type: DataTypes.STRING, allowNull: false },
        },
        { freezeTableName: true, timestamps: false }
    );

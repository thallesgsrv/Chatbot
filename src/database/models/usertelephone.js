'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
    sequelize.define(
        'usertelephone',
        {
            userId: {
                type: DataTypes.BIGINT,
                references: { model: 'user', key: 'id' },
                primaryKey: true,
            },
            telephone: { type: DataTypes.STRING, primaryKey: true },
        },
        { freezeTableName: true, timestamps: false }
    );

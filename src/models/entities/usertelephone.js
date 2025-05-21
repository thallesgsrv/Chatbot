const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');

const UserTelephone = sequelize.define(
    'usertelephone',
    {
        userId: {
            type: DataTypes.BIGINT,
            references: {
                model: 'user',
                key: 'id',
            },
            primaryKey: true,
        },
        telephone: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    },
);

module.exports = UserTelephone;

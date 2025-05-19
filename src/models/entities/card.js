const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');

const Card = sequelize.define(
    'card',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        link: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        callId: {
            type: DataTypes.BIGINT,
            references: {
                model: 'call',
                key: 'id'
            }
        },
        status: {
            type: DataTypes.ENUM('PENDING', 'COMPLETED'),
            allowNull: false,
            defaultValue: 'PENDING',
        },
    },
    {
        freezeTableName: true,
        timestamps: true,
    },
);

module.exports = Card;
const Call = require('./call.js')
const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');

const Attendant = sequelize.define(
    'attendant',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true 
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    },
);

module.exports = Attendant;
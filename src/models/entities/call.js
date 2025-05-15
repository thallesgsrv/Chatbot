const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');
const CreateCall = require('./createcall.js');

const Call = sequelize.define(
    'call',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        position: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('PENDING', 'ACTIVE', 'WAITING', 'COMPLETED'),
            allowNull: false,
        },

        dateTimeFinish: {
            type: DataTypes.DATE,
        },
        rating: {
            type: DataTypes.INTEGER,
            validate: {
                min: 1,
                max: 5
            }
        },
    },
    {
        freezeTableName: true,
        timestamps: false,
    },

);
Call.belongsTo(CreateCall, { foreignKey: 'createCallId', as: 'createcall' });

module.exports = Call;
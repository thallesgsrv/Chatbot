const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');
const User = require('./user.js');
const School = require('./school.js');

const request = sequelize.define(
    'request',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        chatId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('COMPLETED'),
            allowNull: false,
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false,
        }
    },
    {
        freezeTableName: true,
        timestamps: false,
    },
);


CreateCall.belongsTo(User, { foreignKey: 'userId', as: 'user' });
CreateCall.belongsTo(School, { foreignKey: 'schoolId', as: 'school' });

module.exports = CreateCall;
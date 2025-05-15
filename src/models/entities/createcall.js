const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');
const User = require('./user.js');
const School = require('./school.js');

const CreateCall = sequelize.define(
    'createcall',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        idUser: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: User,
                key: 'id'
            }
        },
        idSchool: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: School,
                key: 'id'
            }
        },
        chatId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
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


CreateCall.belongsTo(User, { foreignKey: 'idUser', as: 'user' });
CreateCall.belongsTo(School, { foreignKey: 'idSchool', as: 'school' });

module.exports = CreateCall;
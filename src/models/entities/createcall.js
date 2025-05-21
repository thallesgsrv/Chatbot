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
        userId: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: User,
                key: 'id'
            }
        },
        schoolId: {
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
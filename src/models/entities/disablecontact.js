const Attendant = require ('./attendant.js')
const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');

const DisableContact = sequelize.define(
    'disablecontact',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        telephone: {
            type: DataTypes.STRING,
            allowNull: true
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        disableDate: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        attendantId:{
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: Attendant,
                key: 'id'
            }
        },

        },
    {
        freezeTableName: true,
        timestamps: false,
    },
);

DisableContact.belongsTo(Attendant, {
    foreignKey: 'attendantId',
    as: 'attendant'
});

module.exports = DisableContact

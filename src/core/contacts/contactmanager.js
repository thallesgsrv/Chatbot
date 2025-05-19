const { getRecentContacts, getBotConnection } = require('../bot.js');
const DisableContact = require('../../models/entities/disablecontact.js');

// Retorna contatos recentes e contatos desabilitados (ignorados)
async function getAllContacts() {
    try {
        const botConn = getBotConnection();
        if (!botConn) {
            return { contacts: [], ignoredContacts: [] };
        }

        const contacts = await getRecentContacts(botConn);

        // Busca telefones ignorados na tabela disablecontact
        const ignoredContacts = await DisableContact.findAll({
            attributes: ['telephone']
        });

        return {
            contacts,
            ignoredContacts: ignoredContacts.map(row => row.telephone)
        };
    } catch (error) {
        console.error('Erro ao obter contatos:', error);
        return { contacts: [], ignoredContacts: [] };
    }
}

// Salva a lista de contatos ignorados na tabela disablecontact
async function saveIgnoredContacts(newContacts) {
    try {
        // Remove todos os registros antigos
        await DisableContact.destroy({ where: {} });

        // Insere os novos contatos ignorados
        for (const contact of newContacts) {
            await DisableContact.create({
                telephone: contact.id, 
                description: contact.description || 'Desababilitado por atendente',
                disableDate: new Date(),
                attendantId: contact.attendantId || 1
            });
        }

        const total = await DisableContact.count();

        return {
            success: true,
            added: newContacts.length,
            removed: 0,
            total,
            message: 'Lista de contatos ignorados atualizada'
        };
    } catch (error) {
        console.error('Erro ao atualizar contatos ignorados:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    getAllContacts,
    saveIgnoredContacts
};
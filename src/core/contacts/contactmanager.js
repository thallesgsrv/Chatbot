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
        // Get all new phone numbers to be blocked
        const newPhones = new Set(newContacts.map(c => c.id));
        
        // Get existing disabled contacts
        const existingContacts = await DisableContact.findAll();
        const existingPhones = new Set(existingContacts.map(c => c.telephone));

        // Remove contacts that are no longer in the new list
        const phonesToRemove = [...existingPhones].filter(phone => !newPhones.has(phone));
        if (phonesToRemove.length > 0) {
            await DisableContact.destroy({
                where: {
                    telephone: phonesToRemove
                }
            });
        }

        // Add new contacts that don't exist yet
        const phonesToAdd = [...newPhones].filter(phone => !existingPhones.has(phone));
        for (const phone of phonesToAdd) {
            const contact = newContacts.find(c => c.id === phone);
            await DisableContact.create({
                telephone: phone,
                description: contact.description || 'Desabilitado por atendente',
                disableDate: new Date(),
                attendantId: contact.attendantId || 1
            });
        }

        const total = await DisableContact.count();
        return {
            success: true,
            added: phonesToAdd.length,
            removed: phonesToRemove.length,
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
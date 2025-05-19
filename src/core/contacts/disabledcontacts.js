const DisableContact = require('../../models/entities/disablecontact');
const { Op } = require('sequelize');

class DisabledContactManager {
    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = 60000; // 1 minuto
    }

    normalizePhone(input) {
        // Remove @c.us if present and any non-digits
        return input.replace('@c.us', '').replace(/\D/g, '');
    }

    async isDisabled(phone) {
        try {
            const normalizedPhone = this.normalizePhone(phone);
            const chatIdFormat = `${normalizedPhone}@c.us`;

            // Always check database first
            const isDisabled = await DisableContact.findOne({
                where: {
                    telephone: {
                        [Op.or]: [normalizedPhone, chatIdFormat]
                    }
                }
            });

            return !!isDisabled;
        } catch (error) {
            console.error('Erro ao verificar contato desabilitado:', error);
            return false;
        }
    }

    // Adiciona novo método para remover contato da lista de bloqueados
    async removeFromDisabled(phone) {
        try {
            const normalizedPhone = this.normalizePhone(phone);
            const chatIdFormat = `${normalizedPhone}@c.us`;

            await DisableContact.destroy({
                where: {
                    telephone: {
                        [Op.or]: [normalizedPhone, chatIdFormat]
                    }
                }
            });

            // Clear cache entry if exists
            this.cache.delete(normalizedPhone);
            this.cache.delete(chatIdFormat);

            return true;
        } catch (error) {
            console.error('Erro ao remover contato da lista de desabilitados:', error);
            return false;
        }
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = new DisabledContactManager();

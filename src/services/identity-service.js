'use strict';

const { Op } = require('sequelize');

/**
 * Localiza o usuário a partir do CPF/matrícula informado no WhatsApp.
 *
 * Um mesmo CPF pode ter várias linhas em `user` (uma por vínculo/tipo/escola),
 * por isso o resultado é uma lista.
 */
class IdentityService {
    constructor({ models }) {
        this.models = models;
    }

    /** Usuários cujo identificador (só dígitos) é exatamente `digits`. */
    async findByIdentifier(digits) {
        const { User, School } = this.models;

        const candidates = await User.findAll({
            where: { identifier: { [Op.like]: `%${digits}%` } },
            include: [{ model: School, as: 'schools', required: true }],
            order: [['id', 'ASC']],
        });

        // O LIKE é só um pré-filtro; a comparação real ignora pontuação.
        return candidates.filter((user) => String(user.identifier || '').replace(/\D/g, '') === digits);
    }

    /** Tipos de vínculo distintos (ALUNO, PROFESSOR...) na ordem em que aparecem. */
    static distinctTypes(users) {
        return [...new Set(users.map((user) => user.type))];
    }

    /**
     * Para usuários de UM tipo, devolve as escolas possíveis e quais registros
     * de usuário pertencem a cada uma.
     *
     * @returns {Array<{id, name, client, userIds: number[], userName, userType, iescolarId}>}
     */
    static buildSchoolChoices(users) {
        const bySchool = new Map();

        for (const user of users) {
            for (const school of user.schools || []) {
                if (!bySchool.has(school.id)) bySchool.set(school.id, { school, users: [] });
                bySchool.get(school.id).users.push(user);
            }
        }

        return [...bySchool.values()]
            .map(({ school, users: schoolUsers }) => ({
                id: school.id,
                name: school.name,
                client: school.client,
                userIds: schoolUsers.map((u) => u.id),
                userName: schoolUsers[0].name,
                userType: schoolUsers[0].type,
                iescolarId: schoolUsers[0].iescolarId,
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
}

module.exports = IdentityService;

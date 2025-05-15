const User = require('../../models/entities/user.js');
const School = require('../../models/entities/school.js');
const Call = require('../../models/entities/call.js');
const CreateCall = require('../../models/entities/createcall.js');
const greetings = require('../messages/greetings.json');
const errors = require('../messages/errors.json');
const sequelize = require('../../models/connections/connection');
const { Op } = require('sequelize');

class Screening {
    constructor(io, getStatusUpdate) {
        this.userCurrentTopic = {};
        this.io = io; // Salva a instância do socket.io
        this.getStatusUpdate = getStatusUpdate; // Injected function
    }

    async startScreening(conn, chatId) {
        try {
            const message = this.getRandomWelcomeMessage();
            await conn.client.sendMessage({
                to: chatId,
                body: message,
                options: { type: 'sendText' }
            });
            this.userCurrentTopic[chatId] = { state: 'awaitingCpf' };
        } catch (error) {
            console.error('Error in startScreening:', error);
            throw error;
        }
    }

    async handleCpfInput(conn, chatId, messageText, io) {
        const identifier = messageText.replace(/\D/g, '');
        console.log('Processing identifier:', identifier);

        if (!identifier || identifier.length < 5) {
            await conn.client.sendMessage({
                to: chatId,
                body: errors.invalidIdentifier,
                options: { type: 'sendText' }
            });
            return;
        }

        try {
            // Buscar todos os registros do usuário com o mesmo identifier
            const userRecords = await User.findAll({
                where: {
                    identifier: {
                        [Op.like]: `%${identifier}%`
                    }
                },
                include: [{
                    model: School,
                    through: 'userschool',
                    required: true
                }]
            });

            // Filtra os registros onde o identifier sem caracteres especiais corresponde
            const matchingUserRecords = userRecords.filter(user => {
                const cleanIdentifier = user.identifier.replace(/[.-/]/g, '');
                return cleanIdentifier === identifier;
            });

            if (!matchingUserRecords || matchingUserRecords.length === 0) {
                await conn.client.sendMessage({
                    to: chatId,
                    body: errors.userNotFound,
                    options: { type: 'sendText' }
                });
                this.userCurrentTopic[chatId] = { state: 'awaitingCpf' };
                return;
            }

            // Agrupa os tipos únicos considerando todos os registros do mesmo identifier
            const uniqueTypes = [...new Set(matchingUserRecords.map(user => user.type))];

            if (uniqueTypes.length > 1) {
                let msg = greetings.chooseType;
                uniqueTypes.forEach((type, idx) => {
                    msg += `${idx + 1} - ${type}\n`;
                });

                this.userCurrentTopic[chatId] = {
                    state: 'awaitingTypeSelection',
                    types: uniqueTypes,
                    users: matchingUserRecords,
                    identifier: identifier
                };

                await conn.client.sendMessage({
                    to: chatId,
                    body: msg.trim(),
                    options: { type: 'sendText' }
                });
                return;
            }

            // Se há apenas um tipo, continue com esse tipo
            const userType = uniqueTypes[0];
            const userRecordsByType = matchingUserRecords.filter(user => user.type === userType);

            // Busca todas as escolas associadas a todos os registros do usuário
            await this.handleUserRecordsSchools(conn, chatId, userRecordsByType);

        } catch (error) {
            console.error('Error during CPF processing:', error);
            await conn.client.sendMessage({
                to: chatId,
                body: errors.tryAgainLater,
                options: { type: 'sendText' }
            });
            this.clearUserTopic(chatId);
        }
    }

    async handleUserRecordsSchools(conn, chatId, userRecords) {
        try {
            const schoolPromises = userRecords.map(async (user) => {
                const relations = await sequelize.models.userschool.findAll({
                    where: { idUser: user.id },
                    attributes: ['idSchool']
                });
                return relations.map(r => r.idSchool);
            });

            const schoolIdArrays = await Promise.all(schoolPromises);
            const uniqueSchoolIds = [...new Set(schoolIdArrays.flat())];

            const schools = await School.findAll({
                where: {
                    id: {
                        [Op.in]: uniqueSchoolIds
                    }
                }
            });

            if (!schools || schools.length === 0) {
                await conn.client.sendMessage({
                    to: chatId,
                    body: errors.noSchoolsFound,
                    options: { type: 'sendText' }
                });
                this.clearUserTopic(chatId);
                return;
            }

            // Mapeia quais registros de usuário estão associados a cada escola
            const schoolUserMap = {};
            for (const user of userRecords) {
                const userSchools = await sequelize.models.userschool.findAll({
                    where: { idUser: user.id },
                    attributes: ['idSchool']
                });
                
                for (const relation of userSchools) {
                    if (!schoolUserMap[relation.idSchool]) {
                        schoolUserMap[relation.idSchool] = [];
                    }
                    schoolUserMap[relation.idSchool].push(user);
                }
            }

            await this.checkSchools(conn, chatId, userRecords[0], schools, schoolUserMap);

        } catch (error) {
            console.error('Error fetching schools:', error);
            await conn.client.sendMessage({
                to: chatId,
                body: errors.databaseError || errors.tryAgainLater,
                options: { type: 'sendText' }
            });
            this.clearUserTopic(chatId);
        }
    }

    async checkSchools(conn, chatId, baseUser, schools, schoolUserMap) {
        if (schools.length > 1) {
            let msg = greetings.chooseSchool;
            schools.forEach((school, idx) => {
                const schoolUsers = schoolUserMap[school.id] || [];
                msg += `${idx + 1} - ${school.name}\n`;
            });

            this.userCurrentTopic[chatId] = {
                state: 'awaitingSchoolSelection',
                baseUser,
                schools,
                schoolUserMap
            };

            await conn.client.sendMessage({
                to: chatId,
                body: msg.trim(),
                options: { type: 'sendText' }
            });
            return;
        }

        // Se houver apenas uma escola, use os usuários mapeados para essa escola
        const schoolUsers = schoolUserMap[schools[0].id] || [];
        await this.proceedWithSchoolSelection(conn, chatId, {
            userId: schoolUsers.map(u => u.id),
            userName: schoolUsers[0].name,
            userType: schoolUsers[0].type,
            id: schools[0].id,
            name: schools[0].name,
            client: schools[0].client,
            iescolarId: schoolUsers[0].iescolarId
        });
    }

    async handleTypeSelection(conn, chatId, selection) {
        const userTopic = this.userCurrentTopic[chatId];
    
        if (!userTopic || !userTopic.types || !userTopic.users) {
            await conn.client.sendMessage({
                to: chatId,
                body: errors.invalidSession,
                options: { type: 'sendText' }
            });
            this.clearUserTopic(chatId);
            return;
        }
    
        const selectedType = userTopic.types[selection];
        const usersByType = userTopic.users.filter(user => user.type === selectedType);

        try {
            // Se houver apenas um usuário com um vínculo, use-o diretamente
            if (usersByType.length === 1) {
                const singleUser = usersByType[0];
                const userSchools = await School.findAll({
                    include: [{
                        model: User,
                        where: { id: singleUser.id },
                        through: 'userschool'
                    }]
                });

                if (userSchools.length === 1) {
                    // Se tem apenas uma escola, processa diretamente
                    await this.proceedWithSchoolSelection(conn, chatId, {
                        userId: singleUser.id,
                        userName: singleUser.name,
                        userType: selectedType,
                        id: userSchools[0].id,
                        name: userSchools[0].name,
                        client: userSchools[0].client,
                        iescolarId: singleUser.iescolarId
                    });
                    return;
                }
            }

            // Se chegou aqui, tem múltiplos vínculos - continua com a lógica existente
            const userSchoolRelations = await sequelize.models.userschool.findAll({
                where: {
                    idUser: {
                        [Op.in]: usersByType.map(u => u.id)
                    }
                },
                attributes: ['idUser', 'idSchool']
            });

            if (!userSchoolRelations || userSchoolRelations.length === 0) {
                await conn.client.sendMessage({
                    to: chatId,
                    body: errors.noSchoolsFound,
                    options: { type: 'sendText' }
                });
                this.clearUserTopic(chatId);
                return;
            }
    
            const schoolIds = [...new Set(userSchoolRelations.map(r => r.idSchool))];
            const schools = await School.findAll({
                where: {
                    id: {
                        [Op.in]: schoolIds
                    }
                }
            });
    
            if (!schools || schools.length === 0) {
                await conn.client.sendMessage({
                    to: chatId,
                    body: errors.noSchoolsFound,
                    options: { type: 'sendText' }
                });
                this.clearUserTopic(chatId);
                return;
            }
    
            // Mapeia qual usuário está associado a qual escola
            const schoolUserMap = {};
            userSchoolRelations.forEach(rel => {
                if (!schoolUserMap[rel.idSchool]) {
                    schoolUserMap[rel.idSchool] = [];
                }
                schoolUserMap[rel.idSchool].push(rel.idUser);
            });
    
            // Anexa os users às escolas correspondentes
            const enrichedSchools = schools.map(school => {
                const relatedUserIds = schoolUserMap[school.id] || [];
                const relatedUsers = usersByType.filter(user => relatedUserIds.includes(user.id));
    
                return {
                    ...school.dataValues,
                    userId: relatedUsers.map(u => u.id),
                    userName: relatedUsers.map(u => u.name).join(', '),
                    userType: selectedType,
                    iescolarId: relatedUsers[0]?.iescolarId || null
                };
            });
    
            if (enrichedSchools.length > 1) {
                let msg = greetings.chooseSchool;
                enrichedSchools.forEach((school, idx) => {
                    msg += `${idx + 1} - ${school.name}\n`;
                });
    
                this.userCurrentTopic[chatId] = {
                    state: 'awaitingSchoolSelection',
                    schools: enrichedSchools
                };
    
                await conn.client.sendMessage({
                    to: chatId,
                    body: msg.trim(),
                    options: { type: 'sendText' }
                });
            } else {
                await this.proceedWithSchoolSelection(conn, chatId, enrichedSchools[0]);
            }
    
        } catch (error) {
            console.error('Error fetching schools after type selection:', error);
            await conn.client.sendMessage({
                to: chatId,
                body: errors.databaseError || errors.tryAgainLater,
                options: { type: 'sendText' }
            });
            this.clearUserTopic(chatId);
        }
    }
    
    async handleCitySelection(conn, chatId, selection, cities, type) {
        const selectedCity = cities[selection];
        const citySchools = Array.from(selectedCity.schools);
        await this.handleSchoolSelection(conn, chatId, citySchools, type, selectedCity.city);
    }

    async handleSchoolSelection(conn, chatId, schools, type, city) {
        if (schools.length > 1) {
            let msg = greetings.chooseSchool;
            schools.forEach((school, idx) => {
                msg += `${idx + 1} - ${school.name}\n`;
            });

            this.userCurrentTopic[chatId] = {
                state: 'awaitingSchoolSelection',
                schools: schools,
                type: type,
                city: city,
                identifier: this.userCurrentTopic[chatId].identifier
            };

            await conn.client.sendMessage({
                to: chatId,
                body: msg.trim(),
                options: { type: 'sendText' }
            });
        } else {
            await this.proceedWithSchoolSelection(conn, chatId, schools[0]);
        }
    }

    async proceedWithSchoolSelection(conn, chatId, school) {
        this.userCurrentTopic[chatId] = {
            state: 'cpfTriaged',
            userId: Array.isArray(school.userId) ? school.userId[0] : school.userId,
            userIds: Array.isArray(school.userId) ? school.userId : [school.userId], 
            userName: school.userName,
            userType: school.userType,
            schoolId: school.id,
            schoolName: school.name,
            city: school.client,
            iescolarId: school.iescolarId
        };

        if (conn.client && typeof conn.client.emit === 'function') {
            conn.client.emit('userTriaged', {
                chatId,
                userData: this.userCurrentTopic[chatId]
            });
        }

        const userId = Array.isArray(school.userId) ? school.userId[0] : school.userId;
        
        const createCall = await CreateCall.create({
            idUser: userId,
            idSchool: school.id,
            chatId: chatId,
            date: new Date()
        });

        await Call.create({
            createCallId: createCall.id,
            position: school.userType,
            status: 'ACTIVE'
        });

        // Envie a mensagem de confirmação primeiro
        await conn.client.sendMessage({
            to: chatId,
            body: greetings.confirmSchool.replace('%s', `${school.name} - ${school.client} (${school.userType})`),
            options: { type: 'sendText' }
        });

        // Só depois atualize o front-end
        if (this.io) {
            if (this.getStatusUpdate) {
                const statusData = await this.getStatusUpdate();
                this.io.emit('statusUpdate', statusData);
            } else {
                this.io.emit('forceUpdate');
            }
        }
    }

    getRandomWelcomeMessage() {
        const messages = greetings.welcome;
        if (!Array.isArray(messages) || messages.length === 0) {
            return 'Olá! Para iniciar o atendimento, por favor digite seu CPF ou número de matrícula:';
        }
        const randomIndex = Math.floor(Math.random() * messages.length);
        return messages[randomIndex];
    }

    getUserTopic(chatId) {
        return this.userCurrentTopic[chatId];
    }

    setUserTopic(chatId, topic) {
        this.userCurrentTopic[chatId] = topic;
    }

    clearUserTopic(chatId) {
        delete this.userCurrentTopic[chatId];
    }
}

module.exports = Screening;

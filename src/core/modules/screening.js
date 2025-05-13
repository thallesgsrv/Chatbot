const User = require('../../models/entities/user.js');
const School = require('../../models/entities/school.js');
const Call = require('../../models/entities/call.js');
const CreateCall = require('../../models/entities/createcall.js');
const greetings = require('../messages/greetings.json');
const errors = require('../messages/errors.json');

class Screening {
    constructor(sendMessage) {
        this.sendMessage = sendMessage;
        this.userCurrentTopic = {};
    }

    async sendMessage(conn, chatId, message) {
        try {
            if (conn && conn.client && typeof conn.client.sendMessage === 'function') {
                const messageData = {
                    type: 'text',
                    text: message,
                    to: chatId
                };
                await conn.client.sendMessage(chatId, messageData);
            } else {
                console.error('Invalid connection object or missing sendMessage method');
                throw new Error('Invalid connection configuration');
            }
        } catch (error) {
            console.error('Error in Screening.sendMessage:', error);
            throw error;
        }
    }

    async startScreening(conn, chatId) {
        try {
            const message = this.getRandomWelcomeMessage();
            await this.sendMessage(conn, chatId, message);
            this.userCurrentTopic[chatId] = { state: 'awaitingCpf' };
        } catch (error) {
            console.error('Error in startScreening:', error);
            throw error;
        }
    }

    async handleCpfInput(conn, chatId, messageText, io) {
        const identifier = messageText.replace(/\D/g, '');
        if (!identifier || identifier.length < 5) {
            await this.sendMessage(conn, chatId, errors.invalidIdentifier);
            return;
        }

        try {
            const users = await User.findAll({
                where: { identifier },
                include: [{
                    model: School,
                    through: 'userschool',
                    required: true
                }]
            });

            if (!users || users.length === 0) {
                await this.sendMessage(conn, chatId, errors.userNotFound);
                return;
            }

            const usersByType = new Map();
            const schoolsByTypeCity = new Map();
            
            users.forEach(user => {
                if (!usersByType.has(user.type)) {
                    usersByType.set(user.type, user);
                }

                user.schools.forEach(school => {
                    const key = `${user.type}_${school.client}`;
                    if (!schoolsByTypeCity.has(key)) {
                        schoolsByTypeCity.set(key, {
                            type: user.type,
                            city: school.client,
                            schools: new Set()
                        });
                    }
                    schoolsByTypeCity.get(key).schools.add({
                        id: school.id,
                        name: school.name,
                        client: school.client,
                        userId: user.id,
                        userType: user.type,
                        userName: user.name,
                        iescolarId: user.iescolarId
                    });
                });
            });

            const types = Array.from(usersByType.keys());

            if (types.length > 1) {
                let msg = greetings.chooseType;
                types.forEach((type, idx) => {
                    msg += `${idx + 1} - ${type}\n`;
                });

                this.userCurrentTopic[chatId] = {
                    state: 'awaitingTypeSelection',
                    types: types,
                    schoolsByTypeCity: schoolsByTypeCity,
                    identifier: identifier
                };

                await this.sendMessage(conn, chatId, msg.trim());
                return;
            }

            await this.handleTypeSelection(conn, chatId, 0, types, schoolsByTypeCity);

        } catch (error) {
            console.error('Erro durante triagem:', error);
            await this.sendMessage(conn, chatId, errors.tryAgainLater);
            delete this.userCurrentTopic[chatId];
        }
    }

    async handleTypeSelection(conn, chatId, selection, types, schoolsByTypeCity) {
        const selectedType = types[selection];
        const citiesByType = Array.from(schoolsByTypeCity.values())
            .filter(entry => entry.type === selectedType);

        if (citiesByType.length > 1) {
            let msg = greetings.chooseCity;
            citiesByType.forEach((entry, idx) => {
                msg += `${idx + 1} - ${entry.city}\n`;
            });

            this.userCurrentTopic[chatId] = {
                state: 'awaitingCitySelection',
                type: selectedType,
                cities: citiesByType,
                schoolsByTypeCity: schoolsByTypeCity,
                identifier: this.userCurrentTopic[chatId].identifier
            };

            await this.sendMessage(conn, chatId, msg.trim());
            return;
        }

        await this.handleCitySelection(conn, chatId, 0, citiesByType, selectedType);
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

            await this.sendMessage(conn, chatId, msg.trim());
        } else {
            await this.proceedWithSchoolSelection(conn, chatId, schools[0]);
        }
    }

    async proceedWithSchoolSelection(conn, chatId, school) {
        this.userCurrentTopic[chatId] = {
            state: 'cpfTriaged',
            userId: school.userId,
            userName: school.userName,
            userType: school.userType,
            schoolId: school.id,
            schoolName: school.name,
            city: school.client,
            iescolarId: school.iescolarId
        };

        if (conn.client && conn.client.ev) {
            conn.client.ev.emit('userTriaged', {
                chatId,
                userData: this.userCurrentTopic[chatId]
            });
        }

        // First create CreateCall record
        const createCall = await CreateCall.create({
            idUser: school.userId,
            idSchool: school.id,
            chatId: chatId,
            date: new Date()
        });

        // Then create Call record with reference to CreateCall
        await Call.create({
            createCallId: createCall.id,
            description: 'Início de atendimento',
            position: school.userType,
            status: 'PENDING',
        });

        await this.sendMessage(
            conn,
            chatId,
            greetings.confirmSchool.replace('%s', `${school.name} - ${school.client} (${school.userType})`)
        );
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

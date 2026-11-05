'use strict';

const CallService = require('./call-service');
const QueueService = require('./queue-service');
const StatusService = require('./status-service');
const AttendantService = require('./attendant-service');
const CardService = require('./card-service');
const ContactService = require('./contact-service');
const IdentityService = require('./identity-service');
const SchoolService = require('./school-service');
const StatisticsService = require('./statistics-service');
const ReportService = require('./report-service');

/** Instancia todos os serviços compartilhando os mesmos models. */
function createServices({ models, sequelize, config }) {
    return {
        calls: new CallService({ models, sequelize }),
        queue: new QueueService({ models, maxActiveChats: config.bot.maxActiveChats }),
        status: new StatusService({ models }),
        attendants: new AttendantService({ models }),
        cards: new CardService({ models }),
        contacts: new ContactService({ models }),
        identity: new IdentityService({ models }),
        schools: new SchoolService({ models }),
        statistics: new StatisticsService({ models }),
        reports: new ReportService({ models, assetsDir: config.paths.assets }),
    };
}

module.exports = { createServices };

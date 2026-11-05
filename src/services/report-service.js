'use strict';

const path = require('path');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const { CallStatus } = require('../shared/protocol');
const Format = require('../shared/format');
const { periodRange } = require('./date-range');
const { generateXLSXReport } = require('./reports/xlsx-report');
const { generatePDFReport } = require('./reports/pdf-report');

const CARD_STATUS_LABEL = { COMPLETED: 'Concluído', PENDING: 'Pendente' };
const NO_CARD = 'Não foi necessário';

/** Relatórios de atendimentos concluídos em PDF ou Excel. */
class ReportService {
    constructor({ models, assetsDir }) {
        this.models = models;
        this.logoPath = path.join(assetsDir, 'logo-redenet.png');
    }

    /** Linhas já formatadas para exibição, dentro do período (dias inclusivos). */
    async buildRows({ start, end, city, school }) {
        const { Call, CreateCall, School, User, Card, Attendant } = this.models;
        const range = periodRange(start, end);

        const where = {
            status: CallStatus.COMPLETED,
            description: { [Op.ne]: null },
            '$createcall.date$': { [Op.between]: [range.start, range.end] },
        };
        if (city) where['$createcall.school.client$'] = city;
        if (school) where['$createcall.school.id$'] = school;

        const calls = await Call.findAll({
            where,
            include: [
                {
                    model: CreateCall,
                    as: 'createcall',
                    required: true,
                    attributes: ['date'],
                    include: [
                        { model: School, as: 'school', required: true, attributes: ['id', 'name', 'client'] },
                        { model: User, as: 'user', required: true, attributes: ['name', 'type'] },
                    ],
                },
                { model: Card, as: 'card', required: false, attributes: ['link', 'status'] },
                { model: Attendant, as: 'attendant', required: false, attributes: ['name'] },
            ],
            order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'DESC']],
        });

        return calls.map((call) => {
            const opened = call.createcall.date;
            return {
                protocolo: call.id,
                name: Format.formatName(call.createcall.user.name) || 'N/A',
                position: Format.formatPosition(call.createcall.user.type || call.position) || 'N/A',
                description: call.description,
                school: Format.formatSchoolName(call.createcall.school.name) || 'N/A',
                city: Format.formatName(call.createcall.school.client) || 'N/A',
                date: opened,
                formatted_date: opened.toLocaleString('pt-BR'),
                status: call.status.toLowerCase(),
                duration_minutes: call.dateTimeFinish
                    ? Math.max(0, Math.floor((call.dateTimeFinish - opened) / 60000))
                    : 0,
                attendant_id: Format.formatName(call.attendant && call.attendant.name) || 'Bot',
                card_link: (call.card && call.card.link) || NO_CARD,
                card_status: (call.card && CARD_STATUS_LABEL[call.card.status]) || NO_CARD,
            };
        });
    }

    /** Escreve o relatório na resposta HTTP. */
    async send(res, { start, end, format, city, school }) {
        const rows = await this.buildRows({ start, end, city, school });

        if (format === 'xlsx') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Relatorio-${start}-a-${end}.xlsx"`);
            const workbook = await generateXLSXReport(rows, start, end);
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Relatorio-${start}-a-${end}.pdf"`);
        doc.pipe(res);
        generatePDFReport(doc, rows, start, end, { logoPath: this.logoPath });
        doc.end();
    }
}

module.exports = ReportService;

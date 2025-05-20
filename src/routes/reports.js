const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const School = require('../models/entities/school.js');
const Call = require('../models/entities/call.js');
const Card = require('../models/entities/card.js');
const Attendant = require('../models/entities/attendant.js');
const CreateCall = require('../models/entities/createcall.js');
const User = require('../models/entities/user.js');
const { Op, fn, col, literal } = require('sequelize');
const { generateXLSXReport } = require('../core/reports/templates/xlsx/report.template.js');
const { generatePDFReport } = require('../core/reports/templates/pdf/report.template.js');

router.get('/api/reports/generateReport', async (req, res) => {
    try {
        const { start, end, format, city, school } = req.query;
        
        let where = {
            status: 'COMPLETED',
            description: { [Op.ne]: null },
            '$createcall.date$': {
                [Op.between]: [new Date(start), new Date(end)]
            }
        };

        if (city) where['$createcall.school.client$'] = city;
        if (school) where['$createcall.school.id$'] = school;

        const problems = await Call.findAll({
            where,
            include: [
                {
                    model: CreateCall,
                    as: 'createcall',
                    required: true,
                    attributes: ['date'],
                    include: [
                        {
                            model: School,
                            as: 'school',
                            required: true,
                            attributes: ['name', 'client']
                        },
                        {
                            model: User,
                            as: 'user',
                            required: true,
                            attributes: ['name', 'type']
                        }
                    ]
                },
                {
                    model: Card,
                    as: 'card',
                    required: false,
                    attributes: ['link', 'status']
                },
                {
                    model: Attendant,
                    as: 'attendant',
                    required: false,
                    attributes: ['name']
                }
            ],
            order: [[{ model: CreateCall, as: 'createcall' }, 'date', 'DESC']]
        });

        const formattedProblems = problems.map(problem => ({
            protocolo: problem.id,
            name: formatName(problem.createcall?.user?.name),
            position: formatPosition(problem.createcall?.user?.type || problem.position),
            description: problem.description,
            school: formatSchoolName(problem.createcall?.school?.name),
            city: formatName(problem.createcall?.school?.client),
            formatted_date: problem.createcall?.date.toLocaleString('pt-BR'),
            status: formatStatus(problem.status),
            duration_minutes: problem.dateTimeFinish ? 
                Math.floor((problem.dateTimeFinish - new Date(problem.createcall.date)) / (1000 * 60)) : 0,
            attendant_id: formatName(problem.attendant?.name) || 'Bot',
            card_link: problem.card?.link || 'Não foi necessário',
            card_status: formatCardStatus(problem.card?.status)
        }));

        if (format === 'xlsx') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Relatório-${start}-a-${end}.xlsx`);
            const workbook = await generateXLSXReport(formattedProblems, start, end);
            await workbook.xlsx.write(res);
            return;
        }

        const doc = new PDFDocument({ 
            size: 'A4', 
            margin: 50,
            bufferPages: true
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Relatório-${start}-a-${end}.pdf`);
        
        doc.pipe(res);
        generatePDFReport(doc, formattedProblems, start, end);
        doc.end();

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ 
            error: 'Erro ao gerar relatório',
            details: error.message
        });
    }
});

function formatStatus(status) {
    return {
        'COMPLETED': 'completed',
        'ACTIVE': 'active',
        'PENDING': 'pending',
        'WAITING': 'waiting'
    }[status] || status;
}

function formatCardStatus(status) {
    return {
        'COMPLETED': 'Concluído',
        'PENDING': 'Pendente',
    }[status] || 'Não foi necessário';
}

function formatName(name) {
    if (!name) return 'N/A';
    return name.toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatPosition(position) {
    if (!position) return 'N/A';
    const positionMap = {
        'ALUNO': 'Aluno',
        'PROFESSOR': 'Professor',
        'SECRETARIO': 'Secretário',
        'ADMINISTRADOR': 'Administrador',
        'RESPONSAVEL': 'Responsável',
        'PEDAGOGO': 'Pedagogo',
        'MOTORISTA': 'Motorista'
    };
    return positionMap[position] || position;
}

function formatSchoolName(name) {
    if (!name) return 'N/A';
    return name.split(' ')
        .map(word => {
            if (/^(EMEF|EMEIF|EMEIEF|EE|CEI|CMEI|EM)$/i.test(word)) {
                return word.toUpperCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');
}

module.exports = router;

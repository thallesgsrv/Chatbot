const express = require('express');
const router = express.Router();
const User  = require('../models/entities/user.js');
const School = require('../models/entities/school.js');
const Call = require('../models/entities/call.js');
const Attendant = require('../models/entities/attendant.js');
const CreateCall = require('../models/entities/createcall.js');
const { Op, literal, fn, col } = require('sequelize');

router.get('/api/statistics/getChartData', async (req, res) => {
    try {
        const { client, school } = req.query;
        let where = {
            status: 'COMPLETED',
            description: { [Op.ne]: null }
        };
        let createCallWhere = {};
        if (client) createCallWhere['$school.client$'] = client;
        if (school) createCallWhere['$school.id$'] = school;

        // Gera datas de segunda a sexta da semana local
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay() + 1); // Segunda
        weekStart.setHours(0, 0, 0, 0);
        const weekDates = [];
        for (let i = 0; i < 5; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            weekDates.push(d.toISOString().slice(0, 10)); // yyyy-mm-dd
        }

        // Busca atendimentos concluídos da semana
        const weeklyDataRaw = await Call.findAll({
            attributes: [
                [literal('DATE("createcall"."date")'), 'date'],
                [fn('COUNT', '*'), 'count']
            ],
            where: {
                ...where,
                '$createcall.date$': {
                    [Op.gte]: weekDates[0] + 'T00:00:00.000Z',
                    [Op.lte]: weekDates[4] + 'T23:59:59.999Z'
                }
            },
            include: [{
                model: CreateCall,
                as: 'createcall',
                required: true,
                attributes: [],
                where: createCallWhere,
                include: [{
                    model: School,
                    as: 'school',
                    required: true,
                    attributes: []
                }]
            }],
            group: [literal('DATE("createcall"."date")')],
            order: [literal('DATE("createcall"."date") ASC')]
        });

        // Mapeia os resultados para um objeto {date: count}
        const weeklyCountMap = {};
        weeklyDataRaw.forEach(row => {
            weeklyCountMap[row.getDataValue('date')] = parseInt(row.getDataValue('count'));
        });

        // Monta o array final para o gráfico
        const weeklyLabels = weekDates;
        const weeklyData = weekDates.map(dateStr => ({
            completed: weeklyCountMap[dateStr] || 0
        }));

        // Dados mensais
        const monthlyData = await Call.findAll({
            attributes: [
                [literal('EXTRACT(MONTH FROM "createcall"."date")'), 'month'],
                [fn('COUNT', '*'), 'count']
            ],
            where,
            include: [{
                model: CreateCall,
                as: 'createcall',
                required: true,
                attributes: [],
                where: createCallWhere,
                include: [{
                    model: School,
                    as: 'school',
                    required: true,
                    attributes: []
                }]
            }],
            group: [literal('EXTRACT(MONTH FROM "createcall"."date")')],
            order: [literal('EXTRACT(MONTH FROM "createcall"."date") ASC')]
        });

        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                          'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        
        const clients = await School.findAll({
            attributes: [[fn('DISTINCT', col('client')), 'client']],
            order: [['client', 'ASC']]
        });

        const schools = await School.findAll({
            attributes: ['id', 'name', 'client'],
            where: client ? { client } : {},
            order: [['name', 'ASC']]
        });

        const processed = {
            weekly: {
                labels: weeklyLabels, 
                data: weeklyData
            },
            monthly: {
                labels: monthNames,
                data: Array(12).fill(0).map((_, idx) => {
                    const monthData = monthlyData.find(m => 
                        parseInt(m.getDataValue('month')) === idx + 1
                    );
                    return {
                        completed: monthData ? parseInt(monthData.getDataValue('count')) : 0
                    };
                })
            },
            summary: {
                completedCalls: monthlyData.reduce((sum, row) => 
                    sum + parseInt(row.getDataValue('count')), 0
                )
            },
            filters: {
                clients: clients.map(c => c.getDataValue('client')),
                schools: schools.map(s => ({
                    id: s.id,
                    name: s.name,
                    client: s.client
                }))
            }
        };

        res.json(processed);
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        res.status(500).json({ error: 'Erro interno', details: error.message });
    }
});

router.get('/api/statistics/getCompletedAttendances', async (req, res) => {
    try {
        const { date, position, client, school, attendant } = req.query;
        
        const where = {
            status: 'COMPLETED',
            description: { [Op.ne]: null }
        };

        if (date) {
            where.dateTimeFinish = {
                [Op.between]: [new Date(date), new Date(date + ' 23:59:59')]
            };
        }

        if (position) where.position = position;
        if (attendant) {
            if (attendant === 'Bot') {
                where['$attendant.id$'] = null;
            } else {
                where['$attendant.id$'] = attendant;
            }
        }

        const completedAttendances = await Call.findAll({
            where,
            include: [
                {
                    model: CreateCall,
                    as: 'createcall', 
                    attributes: ['date'],
                    include: [
                        {
                            model: School,
                            as: 'school', 
                            attributes: ['id', 'name', 'client'],
                            where: {
                                ...(school ? { id: school } : {}),
                                ...(client ? { client: client } : {})
                            }
                        },
                        {
                            model: User,
                            as: 'user',
                            attributes: ['name']
                        }
                    ]
                },
                {
                    model: Attendant,
                    as: 'attendant', 
                    attributes: ['id', 'name']
                }
            ],
            order: [['dateTimeFinish', 'DESC']]
        });

        const formattedAttendances = completedAttendances.map(att => ({
            id: att.id,
            name: att.createcall && att.createcall.user ? att.createcall.user.name : '',
            position: att.position,
            description: att.description,
            school: att.createcall && att.createcall.school ? {
                id: att.createcall.school.id,
                name: att.createcall.school.name,  // Send original name without modifications
                client: att.createcall.school.client
            } : null,
            client: att.createcall && att.createcall.school ? att.createcall.school.client : null,
            attendant: att.attendant ? {
                id: att.attendant.id,
                name: att.attendant.name
            } : { id: null, name: 'Bot' },
            date: att.createcall.date.toLocaleString('pt-BR'),
            date_completed: att.dateTimeFinish.toLocaleString('pt-BR'),
            duration_minutes: Math.floor((att.dateTimeFinish - att.createcall.date) / (1000 * 60))
        }));

        res.json(formattedAttendances);
    } catch (error) {
        console.error('Erro ao buscar atendimentos concluídos:', error);
        res.status(500).json({ error: 'Erro ao buscar atendimentos concluídos' });
    }
});

router.get('/api/statistics/getPositions', async (req, res) => {
    try {
        const positions = await Call.findAll({
            attributes: [[fn('DISTINCT', col('position')), 'position']],
            where: {
                position: { [Op.ne]: null }
            },
            order: [['position', 'ASC']]
        });
        
        res.json(positions.map(p => p.getDataValue('position')));
    } catch (error) {
        console.error('Erro ao buscar cargos:', error);
        res.status(500).json({ error: 'Erro ao buscar cargos' });
    }
});

module.exports = router;
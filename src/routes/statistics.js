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
            status: { [Op.ne]: null }
        };
        
        if (client) {
            where['$createcall.school.client$'] = client;
        }
        
        if (school) {
            where['$createcall.school.id$'] = school;
        }

        const monthlyData = await Call.findAll({
            attributes: [
                [fn('date_part', 'month', col('createcall.date')), 'month'],
                [fn('count', '*'), 'count'],
                [fn('count', literal("CASE WHEN status = 'COMPLETED' THEN 1 END")), 'completed'],
                [fn('count', literal("CASE WHEN status = 'PENDING' THEN 1 END")), 'pending']
            ],
            where,
            include: [
                {
                    model: CreateCall,
                    as: 'createcall',
                    required: true,
                    include: [{
                        model: School,
                        as: 'school',
                        required: true
                    }]
                }
            ],
            group: [fn('date_part', 'month', col('createcall.date'))],
            order: [[fn('date_part', 'month', col('createcall.date')), 'ASC']]
        });

        // Weekly data with all necessary fields
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - 7);
        
        const weeklyData = await Call.findAll({
            attributes: [
                [fn('date', col('createcall.date')), 'date'],
                [fn('count', '*'), 'count']
            ],
            where: {
                ...where,
                '$createcall.date$': {
                    [Op.between]: [startOfWeek, new Date()]
                }
            },
            include: [
                {
                    model: CreateCall,
                    attributes: []
                },
                {
                    model: School,
                    attributes: []
                }
            ],
            group: [fn('date', col('createcall.date'))],
            order: [[col('createcall.date'), 'ASC']]
        });

        // Get all schools and clients for filters
        const schools = await School.findAll({
            attributes: ['id', 'name', 'client', 'city'],
            order: [['name', 'ASC']]
        });
        const clients = await School.findAll({
            attributes: [[fn('DISTINCT', col('client')), 'client']],
            where: { client: { [Op.ne]: null } },
            order: [['client', 'ASC']]
        });

        // Get all attendants for filters
        const attendants = await Attendant.findAll({
            attributes: ['id', 'name'],
            order: [['name', 'ASC']]
        });

        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                          'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        const processed = {
            weekly: {
                labels: weeklyData.map(row => {
                    const date = new Date(row.getDataValue('date'));
                    return weekDays[date.getDay()] || '';
                }),
                data: weeklyData.map(row => ({
                    total: parseInt(row.getDataValue('count')),
                    date: row.getDataValue('date')
                }))
            },
            monthly: {
                labels: monthNames,
                data: Array(12).fill(0).map((_, index) => {
                    const monthData = monthlyData.find(m => parseInt(m.getDataValue('month')) === index + 1);
                    return {
                        total: monthData ? parseInt(monthData.getDataValue('count')) : 0,
                        completed: monthData ? parseInt(monthData.getDataValue('completed')) : 0,
                        pending: monthData ? parseInt(monthData.getDataValue('pending')) : 0,
                        month: index + 1
                    };
                })
            },
            summary: {
                totalCalls: monthlyData.reduce((sum, item) => sum + parseInt(item.getDataValue('count')), 0),
                completedCalls: monthlyData.reduce((sum, item) => sum + parseInt(item.getDataValue('completed')), 0),
                pendingCalls: monthlyData.reduce((sum, item) => sum + parseInt(item.getDataValue('pending')), 0)
            },
            filters: {
                schools: schools.map(s => ({
                    id: s.id,
                    name: s.name,
                    client: s.client,
                    city: s.city
                })),
                clients: clients.map(c => c.getDataValue('client')),
                attendants: attendants.map(a => ({
                    id: a.id,
                    name: a.name
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
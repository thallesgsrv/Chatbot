const express = require('express');
const router = express.Router();
const School = require('../models/entities/school.js');
const { Op, fn, col } = require('sequelize');

router.get('/api/filters/getClients', async (req, res) => {
    try {
        const clients = await School.findAll({
            attributes: [
                [fn('DISTINCT', col('client')), 'client']
            ],
            where: {
                client: { 
                    [Op.ne]: null,
                    [Op.ne]: '' 
                }
            },
            order: [['client', 'ASC']]
        });
        
        const clientList = clients
            .map(row => row.getDataValue('client'))
            .filter(client => client); 
        
        console.log('Clientes encontrados:', clientList);    
        res.json(clientList);
    } catch (error) {
        console.error('Erro ao buscar clientes:', error);
        res.status(500).json({ error: 'Erro ao buscar clientes' });
    }
});

router.get('/api/filters/getSchools', async (req, res) => {
    try {
        const { client } = req.query;
        console.log('Client recebido:', client);
        
        const where = { 
            name: { 
                [Op.ne]: null,
                [Op.ne]: '' 
            } 
        };
        
        if (client) {
            where.client = client;
        }
        
        const schools = await School.findAll({
            attributes: ['id', 'name', 'client'],
            where,
            order: [['name', 'ASC']]
        });
        
        const schoolList = schools.map(school => ({
            id: school.id,
            name: school.name,
            client: school.client
        }));
        
        console.log('Escolas encontradas:', schoolList);
        res.json(schoolList);
    } catch (error) {
        console.error('Erro ao buscar escolas:', error);
        res.status(500).json({ error: 'Erro ao buscar escolas' });
    }
});

module.exports = router;

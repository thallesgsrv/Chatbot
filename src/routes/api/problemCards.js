const express = require('express');
const router = express.Router();
const Call = require('../../models/entities/call.js');
const Card = require('../../models/entities/card.js');
const CreateCall = require('../../models/entities/createcall.js');
const { Op } = require('sequelize');

router.get('/test', (req, res) => {
    console.log('Test route accessed');
    res.json({ status: 'API is working' });
});

// Criar novo card
router.post('/create', async (req, res) => {
    try {
        console.log('Recebendo requisição de criação de card:', req.body);
        const { callId, cardLink } = req.body;
        
        if (!callId || !cardLink) {
            console.error('Dados inválidos:', { callId, cardLink });
            return res.status(400).json({ error: 'callId e cardLink são obrigatórios' });
        }

        // Verificar se o call existe
        const call = await Call.findByPk(callId);
        if (!call) {
            return res.status(404).json({ error: 'Call não encontrado' });
        }

        // Criar o card
        const card = await Card.create({
            link: cardLink,
            status: 'PENDING',
            callId: callId,
            createdAt: new Date()
        });

        // Atualizar o call com a referência do card
        await call.update({ cardId: card.id });

        // Emitir evento de card criado
        if (req.app.get('io')) {
            req.app.get('io').emit('cardCreated', {
                ...card.toJSON(),
                chatId: call.chatId
            });
        }

        console.log('Card criado com sucesso:', card);
        res.status(201).json(card);

    } catch (error) {
        console.error('Erro ao criar card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Listar todos os cards com filtros
router.get('/', async (req, res) => {
    try {
        const { status, date } = req.query;
        let where = {};
        
        if (status && status !== 'all') {
            where.status = status.toUpperCase();
        }
        
        if (date) {
            where.createdAt = {
                [Op.between]: [
                    new Date(date + ' 00:00:00'), 
                    new Date(date + ' 23:59:59')
                ]
            };
        }

        // Get all cards with proper nested relationships
        const cards = await Card.findAll({
            where,
            include: [{
                model: Call,
                attributes: ['id', 'createCallId'],
                include: [{
                    model: CreateCall,
                    as: 'createcall',
                    attributes: ['id', 'chatId']
                }]
            }],
            order: [['createdAt', 'DESC']]
        });

        // Map the results and get chatId properly
        const safeCards = await Promise.all(
            cards.map(async (card) => {
                // First get the Call associated with this card
                const call = await Call.findOne({
                    where: { id: card.callId },
                    include: [{
                        model: CreateCall,
                        as: 'createcall',
                        attributes: ['chatId']
                    }]
                });

                return {
                    id: card.id,
                    status: card.status,
                    link: card.link,
                    createdAt: card.createdAt,
                    updatedAt: card.updatedAt,
                    callId: card.callId,
                    chatId: call?.createcall?.chatId || null
                };
            })
        );

        console.log('Cards found:', safeCards.map(c => ({
            id: c.id,
            chatId: c.chatId
        })));

        res.json(safeCards);
    } catch (error) {
        console.error('Route error:', error);
        res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
    }
});

// Marcar card como concluído
router.put('/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const [updated] = await Card.update(
            { 
                status: 'COMPLETED',
                updatedAt: new Date()
            },
            { where: { id } }
        );
        
        if (updated === 0) {
            return res.status(404).json({ error: 'Card não encontrado' });
        }

        const card = await Card.findByPk(id);
        req.app.get('io').emit('cardUpdated', card);
        res.json(card);
    } catch (error) {
        console.error('Erro ao concluir card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Reabrir card
router.put('/:id/reopen', async (req, res) => {
    try {
        const { id } = req.params;
        const [updated] = await Card.update(
            { 
                status: 'PENDING',
                updatedAt: new Date()
            },
            { where: { id } }
        );
        
        if (updated === 0) {
            return res.status(404).json({ error: 'Card não encontrado' });
        }

        const card = await Card.findByPk(id);
        req.app.get('io').emit('cardUpdated', card);
        res.json(card);
    } catch (error) {
        console.error('Erro ao reabrir card:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;

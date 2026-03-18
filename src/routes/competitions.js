const express = require('express');
const router = express.Router();
const { db } = require('../config/database-supabase');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');
const competitionService = require('../services/competitionService');

// Get all competitions
router.get('/', async (req, res) => {
    try {
        const competitions = await db.allAsync(`
            SELECT * FROM trading_competitions 
            ORDER BY 
                CASE 
                    WHEN status = 'active' THEN 1
                    WHEN status = 'upcoming' THEN 2
                    ELSE 3
                END,
                start_time ASC
        `);

        for (const comp of competitions) {
            const count = await db.getAsync(
                'SELECT COUNT(*) as count FROM competition_participants WHERE competition_id = $1',
                [comp.id]
            );
            comp.participantCount = count$1.count || 0;
        }

        res.json({ success: true, data: competitions });
    } catch (error) {
        console.error('Error fetching competitions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get active (live) competitions
router.get('/active', async (req, res) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        const competitions = await db.allAsync(`
            SELECT * FROM trading_competitions 
            WHERE start_time <= $1 AND end_time >= $1
            ORDER BY end_time ASC
        `, [now, now]);

        for (const comp of competitions) {
            const count = await db.getAsync(
                'SELECT COUNT(*) as count FROM competition_participants WHERE competition_id = $1',
                [comp.id]
            );
            comp.participantCount = count$1.count || 0;
        }

        res.json({ success: true, data: competitions });
    } catch (error) {
        console.error('Error fetching active competitions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get upcoming competitions
router.get('/upcoming', async (req, res) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        const competitions = await db.allAsync(`
            SELECT * FROM trading_competitions 
            WHERE start_time > $1
            ORDER BY start_time ASC
        `, [now]);

        for (const comp of competitions) {
            const count = await db.getAsync(
                'SELECT COUNT(*) as count FROM competition_participants WHERE competition_id = $1',
                [comp.id]
            );
            comp.participantCount = count$1.count || 0;
        }

        res.json({ success: true, data: competitions });
    } catch (error) {
        console.error('Error fetching upcoming competitions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get ended competitions
router.get('/ended', async (req, res) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        
        const competitions = await db.allAsync(`
            SELECT * FROM trading_competitions 
            WHERE end_time < $1
            ORDER BY end_time DESC
        `, [now]);

        for (const comp of competitions) {
            const count = await db.getAsync(
                'SELECT COUNT(*) as count FROM competition_participants WHERE competition_id = $1',
                [comp.id]
            );
            comp.participantCount = count$1.count || 0;
        }

        res.json({ success: true, data: competitions });
    } catch (error) {
        console.error('Error fetching ended competitions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get competition details
router.get('/:id', async (req, res) => {
    try {
        const competition = await competitionService.getCompetition(req.params.id);
        
        if (!competition) {
            return res.status(404).json({ success: false, error: 'Competition not found' });
        }

        res.json({ success: true, data: competition });
    } catch (error) {
        console.error('Error fetching competition:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Join competition - SIMPLIFIED VERSION
router.post('/:id/join', authMiddleware, async (req, res) => {
    try {
        const competitionId = req.params.id;
        const userId = req.user.id;
        const now = Math.floor(Date.now() / 1000);

        console.log(`📝 User ${userId} attempting to join competition ${competitionId}`);

        // Check if competition exists
        const competition = await db.getAsync(
            'SELECT * FROM trading_competitions WHERE id = $1',
            [competitionId]
        );

        if (!competition) {
            return res.status(404).json({ 
                success: false, 
                error: 'Competition not found' 
            });
        }

        // Check if already joined
        const existing = await db.getAsync(
            'SELECT * FROM competition_participants WHERE competition_id = $1 AND user_id = $1',
            [competitionId, userId]
        );

        if (existing) {
            return res.status(400).json({ 
                success: false, 
                error: 'Already joined this competition' 
            });
        }

        // Check max participants
        const participantCount = await db.getAsync(
            'SELECT COUNT(*) as count FROM competition_participants WHERE competition_id = $1',
            [competitionId]
        );

        if (participantCount.count >= competition.max_participants) {
            return res.status(400).json({ 
                success: false, 
                error: 'Competition is full' 
            });
        }

        // Get user's trading balance
        const balance = await db.getAsync(
            'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
            [userId]
        );

        const startingBalance = balance$1.usdc_balance || 0;

        // Check entry fee
        if (competition.entry_fee > 0 && startingBalance < competition.entry_fee) {
            return res.status(400).json({ 
                success: false, 
                error: 'Insufficient balance for entry fee' 
            });
        }

        await db.runAsync('BEGIN TRANSACTION');

        try {
            // Deduct entry fee if applicable
            if (competition.entry_fee > 0) {
                await db.runAsync(
                    'UPDATE trading_v2_balances SET usdc_balance = usdc_balance - $1 WHERE user_id = $1',
                    [competition.entry_fee, userId]
                );

                // Add to prize pool
                await db.runAsync(
                    'UPDATE trading_competitions SET prize_pool = prize_pool + $1 WHERE id = $1',
                    [competition.entry_fee, competitionId]
                );
            }

            // Add participant
            await db.runAsync(
                `INSERT INTO competition_participants 
                 (competition_id, user_id, entry_time, starting_balance, status)
                 VALUES ($1, $1, $1, $1, 'active') RETURNING id`,
                [competitionId, userId, now, startingBalance]
            );

            // Update participant count
            await db.runAsync(
                'UPDATE trading_competitions SET current_participants = current_participants + 1 WHERE id = $1',
                [competitionId]
            );

            await db.runAsync('COMMIT');

            console.log(`✅ User ${userId} successfully joined competition ${competitionId}`);

            res.json({ 
                success: true, 
                message: 'Successfully joined competition!',
                data: { joined: true }
            });

        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Error joining competition:', error);
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Failed to join competition' 
        });
    }
});

// Claim prize
router.post('/claim-prize', authMiddleware, async (req, res) => {
    const { competitionId, token } = req.body;
    const userId = req.user.id;

    try {
        await db.runAsync('BEGIN TRANSACTION');

        const participant = await db.getAsync(
            `SELECT * FROM competition_participants 
             WHERE competition_id = $1 AND user_id = $1 AND prize > 0 AND (claimed IS NULL OR claimed = 0)`,
            [competitionId, userId]
        );

        if (!participant) {
            throw new Error('No prize to claim');
        }

        await db.runAsync(
            `UPDATE competition_participants 
             SET claimed = 1, claimed_at = $1, claim_token = $1
             WHERE id = $1`,
            [Math.floor(Date.now() / 1000), token, participant.id]
        );

        if (token === 'USDC') {
            await db.runAsync(
                'UPDATE wallets SET usdc_balance = usdc_balance + $1 WHERE user_id = $1',
                [participant.prize, userId]
            );
        } else {
            await db.runAsync(
                'UPDATE wallets SET usdt_balance = usdt_balance + $1 WHERE user_id = $1',
                [participant.prize, userId]
            );
        }

        await db.runAsync('COMMIT');
        res.json({ success: true, message: 'Prize claimed successfully' });

    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Claim prize error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get user's competition stats
router.get('/user/stats', authMiddleware, async (req, res) => {
    try {
        const stats = await competitionService.getUserCompetitionStats(req.user.id);
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ADMIN: Create competition
router.post('/admin/create', adminMiddleware, async (req, res) => {
    try {
        const id = await competitionService.createCompetition(req.body, req.user.id);
        res.json({ success: true, message: 'Competition created', competitionId: id });
    } catch (error) {
        console.error('Error creating competition:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ADMIN: Update competition
router.put('/admin/:id', adminMiddleware, async (req, res) => {
    try {
        await db.runAsync(
            `UPDATE trading_competitions 
             SET name = $1, description = $1, prize_pool = $1, entry_fee = $1,
                 start_time = $1, end_time = $1, min_trades = $1, max_participants = $1, rules = $1
             WHERE id = $1`,
            [
                req.body.name, req.body.description, req.body.prize_pool, req.body.entry_fee,
                req.body.start_time, req.body.end_time, req.body.min_trades, req.body.max_participants,
                req.body.rules, req.params.id
            ]
        );
        res.json({ success: true, message: 'Competition updated' });
    } catch (error) {
        console.error('Error updating competition:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ADMIN: Delete competition
router.delete('/admin/:id', adminMiddleware, async (req, res) => {
    try {
        await db.runAsync('DELETE FROM trading_competitions WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Competition deleted' });
    } catch (error) {
        console.error('Error deleting competition:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

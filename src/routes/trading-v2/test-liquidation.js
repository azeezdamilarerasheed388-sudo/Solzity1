const express = require('express');
const auth = require('../../middleware/trading-v2/auth');
const { getDb } = require('../../config/database-supabase');

const router = express.Router();

router.post('/simulate-loss', auth, async (req, res) => {
    const db = await getDb();
    
    try {
        const userId = req.userId;
        const { positionId, lossAmount } = req.body;
        
        if (!positionId || !lossAmount) {
            return res.status(400).json({ error: 'Missing positionId or lossAmount' });
        }
        
        const position = await db.getAsync(
            'SELECT * FROM trading_v2_positions WHERE id = $1 AND user_id = $2',
            [positionId, userId]
        );
        
        if (!position) {
            return res.status(404).json({ error: 'Position not found' });
        }
        
        await db.runAsync(
            'UPDATE trading_v2_positions SET pnl = $1 WHERE id = $2',
            [-lossAmount, positionId]
        );
        
        res.json({ 
            success: true, 
            message: `Simulated loss of $${lossAmount} on position ${positionId}` 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

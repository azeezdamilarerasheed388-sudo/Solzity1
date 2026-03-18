const express = require('express');
const { getDb } = require('../../config/database-supabase');
const auth = require('../../middleware/trading-v2/auth');

const router = express.Router();

// Get all positions (open and closed) - REAL DATA ONLY
router.get('/positions/all', auth, async (req, res) => {
    try {
        const db = await getDb();
        const userId = req.userId;
        
        const positions = await db.allAsync(
            `SELECT * FROM trading_v2_positions 
             WHERE user_id = $1 
             ORDER BY 
                CASE WHEN status = 'OPEN' THEN 0 ELSE 1 END,
                closed_at DESC,
                created_at DESC`,
            [userId]
        );
        
        res.json({ success: true, data: positions || [] });
        
    } catch (error) {
        console.error('Error fetching positions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get closed positions only - REAL DATA ONLY
router.get('/positions/closed', auth, async (req, res) => {
    try {
        const db = await getDb();
        const userId = req.userId;
        
        const positions = await db.allAsync(
            `SELECT * FROM trading_v2_positions 
             WHERE user_id = $1 AND status IN ('CLOSED', 'LIQUIDATED')
             ORDER BY closed_at DESC`,
            [userId]
        );
        
        res.json({ success: true, data: positions || [] });
        
    } catch (error) {
        console.error('Error fetching closed positions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get position statistics - REAL DATA ONLY
router.get('/stats', auth, async (req, res) => {
    try {
        const db = await getDb();
        const userId = req.userId;
        
        const closedPositions = await db.allAsync(
            `SELECT * FROM trading_v2_positions 
             WHERE user_id = $1 AND status IN ('CLOSED', 'LIQUIDATED')`,
            [userId]
        );
        
        const positions = closedPositions || [];
        const totalTrades = positions.length;
        const winningTrades = positions.filter(p => (p.pnl || 0) > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100) : 0;
        const netPnl = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);
        const bestTrade = positions.length > 0 ? Math.max(...positions.map(p => p.pnl || 0)) : 0;
        const worstTrade = positions.length > 0 ? Math.min(...positions.map(p => p.pnl || 0)) : 0;
        
        res.json({
            success: true,
            data: {
                totalTrades,
                winningTrades,
                losingTrades: totalTrades - winningTrades,
                winRate,
                netPnl,
                bestTrade,
                worstTrade
            }
        });
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

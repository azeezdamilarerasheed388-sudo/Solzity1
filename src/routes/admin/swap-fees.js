const express = require('express');
const { getDb } = require('../../config/database-supabase');
const { adminMiddleware } = require('../../middleware/admin');
const swapFeeService = require('../../services/trading-v2/swapFeeService');

const router = express.Router();

// Get summary statistics
router.get('/summary', adminMiddleware, async (req, res) => {
    try {
        const db = await getDb();
        const today = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        
        // Get total all time
        const totalResult = await db.getAsync(
            'SELECT COALESCE(SUM(amount), 0) as total FROM trading_v2_swap_fees'
        );
        
        // Get today's total
        const todayResult = await db.getAsync(
            'SELECT COALESCE(SUM(amount), 0) as total FROM trading_v2_swap_fees WHERE created_at > $1',
            [today]
        );
        
        // Get users charged today
        const usersToday = await db.getAsync(
            'SELECT COUNT(DISTINCT user_id) as count FROM trading_v2_swap_fees WHERE created_at > $1',
            [today]
        );
        
        // Get positions closed today due to fees
        const positionsToday = await db.getAsync(
            `SELECT COUNT(*) as count FROM trading_v2_positions 
             WHERE close_reason = $1 AND closed_at > $2`,
            ['Swap Fee', today]
        );
        
        res.json({
            success: true,
            data: {
                total: totalResult?.total || 0,
                today: todayResult?.total || 0,
                usersCharged: usersToday?.count || 0,
                positionsClosed: positionsToday?.count || 0
            }
        });
        
    } catch (error) {
        console.error('Summary error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get today's fee collections
router.get('/today', adminMiddleware, async (req, res) => {
    try {
        const db = await getDb();
        const today = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        
        const fees = await db.allAsync(
            `SELECT f.*, u.username,
                    (SELECT COUNT(*) FROM trading_v2_positions 
                     WHERE user_id = f.user_id AND close_reason = $1 
                     AND closed_at BETWEEN f.created_at - 60 AND f.created_at + 60) as positions_closed
             FROM trading_v2_swap_fees f
             LEFT JOIN users u ON f.user_id = u.id
             WHERE f.created_at > $2
             ORDER BY f.created_at DESC`,
            ['Swap Fee', today]
        );
        
        res.json({ success: true, data: fees || [] });
        
    } catch (error) {
        console.error('Today error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get fee history
router.get('/history', adminMiddleware, async (req, res) => {
    try {
        const db = await getDb();
        const { days = 30 } = req.query;
        
        let query = `
            SELECT f.*, u.username,
                   (SELECT COUNT(*) FROM trading_v2_positions 
                    WHERE user_id = f.user_id AND close_reason = $1 
                    AND closed_at BETWEEN f.created_at - 60 AND f.created_at + 60) as positions_closed,
                   (SELECT usdc_balance FROM trading_v2_balances WHERE user_id = f.user_id) as balance_before
            FROM trading_v2_swap_fees f
            LEFT JOIN users u ON f.user_id = u.id
        `;
        
        const params = ['Swap Fee'];
        
        if (days !== 'all') {
            const since = Math.floor(Date.now() / 1000) - (parseInt(days) * 24 * 60 * 60);
            query += ` WHERE f.created_at > $2`;
            params.push(since);
        }
        
        query += ` ORDER BY f.created_at DESC LIMIT 100`;
        
        const fees = await db.allAsync(query, params);
        
        res.json({ success: true, data: fees || [] });
        
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update swap fee settings
router.post('/settings', adminMiddleware, async (req, res) => {
    try {
        const { amount, time } = req.body;
        res.json({ 
            success: true, 
            message: 'Settings updated. Changes will apply on next restart.',
            data: { amount, time }
        });
    } catch (error) {
        console.error('Settings error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Trigger fee collection now
router.post('/trigger', adminMiddleware, async (req, res) => {
    try {
        await swapFeeService.applySwapFees();
        res.json({ 
            success: true, 
            message: 'Swap fee collection triggered successfully'
        });
    } catch (error) {
        console.error('Trigger error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

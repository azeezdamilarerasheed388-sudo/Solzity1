const express = require('express');
const router = express.Router();
const { db } = require('../../config/database-supabase');
const { adminMiddleware } = require('../../middleware/admin');

// Update all withdrawal limits
router.post('/update', adminMiddleware, async (req, res) => {
    try {
        const { SOL, USDC, USDT } = req.body;
        const now = Math.floor(Date.now() / 1000);
        
        await db.runAsync('BEGIN TRANSACTION');
        
        // Update SOL limits
        await db.runAsync(
            `UPDATE admin_settings 
             SET min_withdrawal_sol = $1,
                 max_withdrawal_sol = $2,
                 auto_approve_sol = $3,
                 updated_at = $4,
                 updated_by = $5
             WHERE id = 1`,
            [SOL.min, SOL.max, SOL.autoApprove, now, req.user.id]
        );
        
        // Update USDC limits
        await db.runAsync(
            `UPDATE admin_settings 
             SET min_withdrawal_usdc = $1,
                 max_withdrawal_usdc = $2,
                 auto_approve_usdc = $3,
                 updated_at = $4,
                 updated_by = $5
             WHERE id = 1`,
            [USDC.min, USDC.max, USDC.autoApprove, now, req.user.id]
        );
        
        // Update USDT limits
        await db.runAsync(
            `UPDATE admin_settings 
             SET min_withdrawal_usdt = $1,
                 max_withdrawal_usdt = $2,
                 auto_approve_usdt = $3,
                 updated_at = $4,
                 updated_by = $5
             WHERE id = 1`,
            [USDT.min, USDT.max, USDT.autoApprove, now, req.user.id]
        );
        
        await db.runAsync('COMMIT');
        
        res.json({ success: true, message: 'Limits updated successfully' });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Error updating limits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

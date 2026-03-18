const express = require('express');
const router = express.Router();
const { db } = require('../config/database-supabase');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');
const withdrawalService = require('../services/withdrawalService');

// Get withdrawal fees
router.get('/fees', async (req, res) => {
    try {
        const fees = await withdrawalService.getFees();
        res.json({ success: true, fees });
    } catch (error) {
        console.error('Error fetching fees:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get withdrawal limits
router.get('/limits', async (req, res) => {
    try {
        const limits = await withdrawalService.getLimits();
        res.json({ success: true, limits });
    } catch (error) {
        console.error('Error fetching limits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get user's withdrawals
router.get('/my', authMiddleware, async (req, res) => {
    try {
        const withdrawals = await db.allAsync(
            `SELECT * FROM withdrawals 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [req.user.id]
        );
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('Error fetching withdrawals:', error);
        res.status(500).json({ error: error.message });
    }
});

// Request withdrawal
router.post('/request', authMiddleware, async (req, res) => {
    try {
        const { token, amount, address, twofa } = req.body;
        
        const result = await withdrawalService.requestWithdrawal(
            req.user.id, token, amount, address, twofa
        );
        
        res.json({ success: true, withdrawal: result });
    } catch (error) {
        console.error('Withdrawal request error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ADMIN: Get pending withdrawals
router.get('/admin/pending', adminMiddleware, async (req, res) => {
    try {
        const withdrawals = await withdrawalService.getPendingWithdrawals();
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('Error fetching pending withdrawals:', error);
        res.status(500).json({ error: error.message });
    }
});

// ADMIN: Get all withdrawals
router.get('/admin/all', adminMiddleware, async (req, res) => {
    try {
        const withdrawals = await withdrawalService.getAllWithdrawals();
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('Error fetching all withdrawals:', error);
        res.status(500).json({ error: error.message });
    }
});

// ADMIN: Process withdrawal (approve)
router.post('/admin/process/:id', adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const withdrawal = await db.getAsync(
            "SELECT * FROM withdrawals WHERE id = $1 AND status = 'pending'",
            [id]
        );
        
        if (!withdrawal) {
            return res.status(404).json({ error: 'Withdrawal not found or already processed' });
        }
        
        await db.runAsync(
            `UPDATE withdrawals 
             SET status = 'completed', 
                 processed_at = $2,
                 approved_by = $3
             WHERE id = $1`,
            [id, Math.floor(Date.now() / 1000), req.user.id]
        );
        
        res.json({ success: true, message: 'Withdrawal approved and processed successfully' });
    } catch (error) {
        console.error('Error processing withdrawal:', error);
        res.status(500).json({ error: error.message });
    }
});

// ADMIN: Decline withdrawal
router.post('/admin/decline/:id', adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const withdrawal = await db.getAsync(
            "SELECT * FROM withdrawals WHERE id = $1 AND status = 'pending'",
            [id]
        );
        
        if (!withdrawal) {
            return res.status(404).json({ error: 'Withdrawal not found or already processed' });
        }
        
        await db.runAsync('BEGIN TRANSACTION');
        
        // Refund the user's balance
        const balanceCol = `${withdrawal.token.toLowerCase()}_balance`;
        await db.runAsync(
            `UPDATE wallets SET ${balanceCol} = ${balanceCol} + $2 WHERE user_id = $1`,
            [withdrawal.user_id, withdrawal.amount + withdrawal.fee]
        );
        
        // FIXED: Removed tx_signature from UPDATE - it should only be used for successful on-chain transactions
        await db.runAsync(
            `UPDATE withdrawals 
             SET status = 'declined', 
                 processed_at = $2,
                 approved_by = $3
             WHERE id = $1`,
            [id, Math.floor(Date.now() / 1000), req.user.id]
        );
        
        await db.runAsync('COMMIT');
        
        res.json({ success: true, message: 'Withdrawal declined and funds refunded' });
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Error declining withdrawal:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
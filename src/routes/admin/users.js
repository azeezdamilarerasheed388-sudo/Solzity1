const express = require('express');
const router = express.Router();
const { db } = require('../../config/database-supabase');
const { adminMiddleware } = require('../../middleware/admin');

// Get all users with their balances
router.get('/', adminMiddleware, async (req, res) => {
    try {
        const users = await db.allAsync(`
            SELECT 
                u.id, 
                u.email, 
                u.username, 
                u.created_at,
                u.is_admin,
                u.twofa_enabled,
                w.sol_balance,
                w.usdc_balance,
                w.usdt_balance,
                w.solana_address
            FROM users u
            LEFT JOIN wallets w ON u.id = w.user_id
            ORDER BY u.id DESC
        `);
        
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single user details
router.get('/:id', adminMiddleware, async (req, res) => {
    try {
        const user = await db.getAsync(`
            SELECT 
                u.id, 
                u.email, 
                u.username, 
                u.created_at,
                u.is_admin,
                u.twofa_enabled,
                w.sol_balance,
                w.usdc_balance,
                w.usdt_balance,
                w.solana_address
            FROM users u
            LEFT JOIN wallets w ON u.id = w.user_id
            WHERE u.id = $1
        `, [req.params.id]);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        // Get user's recent activity
        const deposits = await db.allAsync(
            'SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
            [req.params.id]
        );
        
        const withdrawals = await db.allAsync(
            'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
            [req.params.id]
        );
        
        const transfers = await db.allAsync(
            'SELECT * FROM transfers WHERE sender_id = $1 OR recipient_id = $2 ORDER BY created_at DESC LIMIT 5',
            [req.params.id, req.params.id]
        );
        
        res.json({
            success: true,
            user,
            recentActivity: {
                deposits,
                withdrawals,
                transfers
            }
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update user balance (manual adjustment)
router.post('/:id/balance', adminMiddleware, async (req, res) => {
    try {
        const { token, amount, type, reason } = req.body;
        const userId = req.params.id;
        const now = Math.floor(Date.now() / 1000);
        
        if (!token || !amount || !type) {
            return res.status(400).json({ 
                success: false, 
                error: 'Token, amount, and type are required' 
            });
        }
        
        const validTokens = ['SOL', 'USDC', 'USDT'];
        if (!validTokens.includes(token)) {
            return res.status(400).json({ success: false, error: 'Invalid token' });
        }
        
        const balanceCol = token === 'SOL' ? 'sol_balance' : `${token.toLowerCase()}_balance`;
        
        await db.runAsync('BEGIN TRANSACTION');
        
        // Get current balance
        const current = await db.getAsync(
            `SELECT ${balanceCol} FROM wallets WHERE user_id = $1`,
            [userId]
        );
        
        if (!current) {
            throw new Error('User wallet not found');
        }
        
        let newBalance;
        let changeType;
        
        if (type === 'add') {
            newBalance = (current[balanceCol] || 0) + amount;
            changeType = 'credit';
        } else if (type === 'subtract') {
            if ((current[balanceCol] || 0) < amount) {
                throw new Error('Insufficient balance');
            }
            newBalance = (current[balanceCol] || 0) - amount;
            changeType = 'debit';
        } else if (type === 'set') {
            newBalance = amount;
            changeType = 'set';
        } else {
            throw new Error('Invalid operation type');
        }
        
        // Update balance
        await db.runAsync(
            `UPDATE wallets SET ${balanceCol} = $1 WHERE user_id = $2`,
            [newBalance, userId]
        );
        
        // Record the adjustment
        await db.runAsync(
            `INSERT INTO admin_balance_adjustments 
             (user_id, token, old_balance, new_balance, change_type, amount, reason, admin_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                userId, 
                token, 
                current[balanceCol] || 0, 
                newBalance, 
                changeType, 
                amount, 
                reason || 'Manual adjustment', 
                req.user.id, 
                now
            ]
        );
        
        await db.runAsync('COMMIT');
        
        res.json({ 
            success: true, 
            message: `Balance updated successfully`,
            newBalance
        });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Error updating balance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get fee settings
router.get('/settings/fees', adminMiddleware, async (req, res) => {
    try {
        const settings = await db.getAsync('SELECT * FROM admin_settings WHERE id = 1');
        
        res.json({
            success: true,
            fees: {
                withdrawal: {
                    SOL: settings?.withdrawal_fee_sol || 0.01,
                    USDC: settings?.withdrawal_fee_usdc || 3.0,
                    USDT: settings?.withdrawal_fee_usdt || 3.0
                },
                transfer: {
                    SOL: settings?.transfer_fee_sol || 0.001,
                    USDC: settings?.transfer_fee_usdc || 0.5,
                    USDT: settings?.transfer_fee_usdt || 0.5
                },
                trading: {
                    feePerVolume: 15,
                    leverage: 100,
                    swapFee: 5.00
                }
            }
        });
    } catch (error) {
        console.error('Error fetching fee settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update withdrawal fees
router.post('/settings/withdrawal-fees', adminMiddleware, async (req, res) => {
    try {
        const { sol, usdc, usdt } = req.body;
        const now = Math.floor(Date.now() / 1000);
        
        await db.runAsync(
            `UPDATE admin_settings 
             SET withdrawal_fee_sol = $1, 
                 withdrawal_fee_usdc = $2, 
                 withdrawal_fee_usdt = $3,
                 updated_at = $4,
                 updated_by = $5
             WHERE id = 1`,
            [sol, usdc, usdt, now, req.user.id]
        );
        
        res.json({ success: true, message: 'Withdrawal fees updated successfully' });
    } catch (error) {
        console.error('Error updating withdrawal fees:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update transfer fees
router.post('/settings/transfer-fees', adminMiddleware, async (req, res) => {
    try {
        const { sol, usdc, usdt } = req.body;
        const now = Math.floor(Date.now() / 1000);
        
        await db.runAsync(
            `UPDATE admin_settings 
             SET transfer_fee_sol = $1, 
                 transfer_fee_usdc = $2, 
                 transfer_fee_usdt = $3,
                 updated_at = $4,
                 updated_by = $5
             WHERE id = 1`,
            [sol, usdc, usdt, now, req.user.id]
        );
        
        res.json({ success: true, message: 'Transfer fees updated successfully' });
    } catch (error) {
        console.error('Error updating transfer fees:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

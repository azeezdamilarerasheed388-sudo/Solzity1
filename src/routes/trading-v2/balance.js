const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../config/database-supabase');
const auth = require('../../middleware/trading-v2/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
    const db = await getDb();
    
    try {
        const userId = req.userId;
        
        const mainBalances = await db.getAsync(
            'SELECT usdc_balance, usdt_balance FROM wallets WHERE user_id = $1',
            [userId]
        );
        
        const tradingBalance = await db.getAsync(
            'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
            [userId]
        );
        
        res.json({
            success: true,
            data: {
                mainUSDC: mainBalances?.usdc_balance || 0,
                mainUSDT: mainBalances?.usdt_balance || 0,
                tradingUSDT: tradingBalance?.usdc_balance || 0
            }
        });
        
    } catch (error) {
        console.error('Balance error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/to-trading', auth, async (req, res) => {
    const db = await getDb();
    
    try {
        const { amount, token } = req.body;
        const userId = req.userId;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        
        if (!token || !['USDC', 'USDT'].includes(token)) {
            return res.status(400).json({ success: false, error: 'Invalid token' });
        }
        
        await db.runAsync('BEGIN TRANSACTION');
        
        const balanceCol = token === 'USDC' ? 'usdc_balance' : 'usdt_balance';
        
        const mainBalance = await db.getAsync(
            `SELECT ${balanceCol} FROM wallets WHERE user_id = $1`,
            [userId]
        );
        
        if (!mainBalance || mainBalance[balanceCol] < amount) {
            throw new Error(`Insufficient ${token} balance`);
        }
        
        await db.runAsync(
            `UPDATE wallets SET ${balanceCol} = ${balanceCol} - $1 WHERE user_id = $2`,
            [amount, userId]
        );
        
        await db.runAsync(
            `INSERT INTO trading_v2_balances (user_id, usdc_balance) 
             VALUES ($1, $2)
             ON CONFLICT(user_id) DO UPDATE SET 
             usdc_balance = trading_v2_balances.usdc_balance + $2,
             updated_at = CURRENT_TIMESTAMP`,
            [userId, amount]
        );
        
        // FIXED: Use toISOString() for timestamp or CURRENT_TIMESTAMP
        const transferId = uuidv4();
        await db.runAsync(
            `INSERT INTO trading_v2_transfers (id, user_id, direction, amount, created_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [transferId, userId, 'to_trading', amount]
        );
        
        await db.runAsync('COMMIT');
        
        res.json({ success: true, message: `Transferred $${amount} ${token} to trading` });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Transfer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

router.post('/to-main', auth, async (req, res) => {
    const db = await getDb();
    
    try {
        const { amount, token } = req.body;
        const userId = req.userId;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        
        if (!token || !['USDC', 'USDT'].includes(token)) {
            return res.status(400).json({ success: false, error: 'Invalid token' });
        }
        
        await db.runAsync('BEGIN TRANSACTION');
        
        const tradingBalance = await db.getAsync(
            'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
            [userId]
        );
        
        if (!tradingBalance || tradingBalance.usdc_balance < amount) {
            throw new Error('Insufficient trading balance');
        }
        
        const openPositions = await db.getAsync(
            'SELECT COUNT(*) as count FROM trading_v2_positions WHERE user_id = $1 AND status = $2',
            [userId, 'OPEN']
        );
        
        if (openPositions.count > 0) {
            throw new Error('Close all positions first');
        }
        
        await db.runAsync(
            'UPDATE trading_v2_balances SET usdc_balance = usdc_balance - $1 WHERE user_id = $2',
            [amount, userId]
        );
        
        const balanceCol = token === 'USDC' ? 'usdc_balance' : 'usdt_balance';
        await db.runAsync(
            `UPDATE wallets SET ${balanceCol} = ${balanceCol} + $1 WHERE user_id = $2`,
            [amount, userId]
        );
        
        // FIXED: Use CURRENT_TIMESTAMP instead of Unix timestamp
        const transferId = uuidv4();
        await db.runAsync(
            `INSERT INTO trading_v2_transfers (id, user_id, direction, amount, created_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [transferId, userId, 'to_main', amount]
        );
        
        await db.runAsync('COMMIT');
        
        res.json({ success: true, message: `Transferred $${amount} to ${token}` });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Transfer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;

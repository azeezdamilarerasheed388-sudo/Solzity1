const express = require('express');
const router = express.Router();
const { db } = require('../config/database-supabase');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const wallet = await db.getAsync(
            'SELECT sol_balance, usdc_balance, usdt_balance FROM wallets WHERE user_id = ?',
            [userId]
        );
        
        if (!wallet) {
            return res.json({ 
                success: true, 
                balances: { sol: 0, usdc: 0, usdt: 0 }
            });
        }
        
        res.json({ 
            success: true, 
            balances: {
                sol: wallet.sol_balance || 0,
                usdc: wallet.usdc_balance || 0,
                usdt: wallet.usdt_balance || 0
            }
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

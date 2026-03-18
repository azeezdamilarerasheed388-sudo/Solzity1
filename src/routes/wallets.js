const express = require('express');
const router = express.Router();
const walletService = require('../services/walletService');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const wallet = await walletService.getUserWallet(req.user.id);
        const balances = await walletService.getUserBalances(req.user.id);
        
        res.json({
            depositAddress: wallet.solana_address,
            balances
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const masterWalletService = require('../services/masterWalletService');
const { adminMiddleware } = require('../middleware/admin');

// Get master wallet balances
router.get('/balances', adminMiddleware, async (req, res) => {
    try {
        const balances = await masterWalletService.getMasterBalances();
        res.json({ success: true, ...balances });
    } catch (error) {
        console.error('❌ Error in /balances:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all users on-chain balances
router.get('/users/balances', adminMiddleware, async (req, res) => {
    try {
        const balances = await masterWalletService.getAllUsersOnChainBalances();
        res.json({ success: true, users: balances });
    } catch (error) {
        console.error('❌ Error in /users/balances:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sweep SOL from user
router.post('/sweep/sol/:userId', adminMiddleware, async (req, res) => {
    try {
        const result = await masterWalletService.sweepSOL(req.params.userId);
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Sweep USDC from user
router.post('/sweep/usdc/:userId', adminMiddleware, async (req, res) => {
    try {
        const result = await masterWalletService.sweepToken(req.params.userId, 'USDC');
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Sweep USDT from user
router.post('/sweep/usdt/:userId', adminMiddleware, async (req, res) => {
    try {
        const result = await masterWalletService.sweepToken(req.params.userId, 'USDT');
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Sweep all tokens from a single user
router.post('/sweep/all/:userId', adminMiddleware, async (req, res) => {
    try {
        const result = await masterWalletService.sweepAllFromUser(req.params.userId);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Sweep all tokens from all users
router.post('/sweep/all-users', adminMiddleware, async (req, res) => {
    try {
        const results = await masterWalletService.sweepAllUsers();
        res.json({ success: true, results });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Withdraw to cold wallet
router.post('/withdraw', adminMiddleware, async (req, res) => {
    try {
        const { token, amount, address } = req.body;
        const result = await masterWalletService.withdrawToColdWallet(token, amount, address);
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Reconcile balances
router.get('/reconcile', adminMiddleware, async (req, res) => {
    try {
        const discrepancies = await masterWalletService.reconcileBalances();
        res.json({ 
            success: true, 
            discrepancies,
            message: discrepancies.length === 0 ? 'All balances match!' : 'Discrepancies found'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const transferService = require('../services/transferService');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');

// Get transfer fees
router.get('/fees', async (req, res) => {
    try {
        const fees = await transferService.getTransferFees();
        res.json({ success: true, fees });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search for user
router.post('/search', authMiddleware, async (req, res) => {
    try {
        const { username } = req.body;
        const user = await transferService.findUserByUsername(username);
        
        // Don't return if searching for self
        if (user.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot transfer to yourself' });
        }
        
        res.json({ 
            success: true, 
            user: {
                id: user.id,
                username: user.username || user.email
            }
        });
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

// Get user balance
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const balances = await transferService.getUserBalance(req.user.id);
        res.json({ success: true, balances });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Make transfer
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { recipient, token, amount, memo } = req.body;
        
        const result = await transferService.transfer(
            req.user.id,
            recipient,
            token,
            parseFloat(amount),
            memo
        );
        
        res.json({ 
            success: true, 
            message: `Successfully sent ${amount} ${token} to ${result.recipient.username}`,
            transfer: result
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get transfer history
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const transfers = await transferService.getUserTransfers(req.user.id);
        res.json({ success: true, transfers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN: Get all transfers
router.get('/admin/all', adminMiddleware, async (req, res) => {
    try {
        const transfers = await transferService.getAllTransfers();
        res.json({ success: true, transfers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN: Update transfer fees
router.post('/admin/fees', adminMiddleware, async (req, res) => {
    try {
        const { sol, usdc, usdt } = req.body;
        
        if (sol < 0 || usdc < 0 || usdt < 0) {
            return res.status(400).json({ error: 'Fees cannot be negative' });
        }
        
        const result = await transferService.updateTransferFees(
            { SOL: sol, USDC: usdc, USDT: usdt },
            req.user.id
        );
        
        res.json({ 
            success: true, 
            message: 'Transfer fees updated successfully',
            fees: result.fees
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

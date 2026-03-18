const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const transferService = require('../services/trading/transferService');
const tradingService = require('../services/trading/tradingService');
const priceOracle = require('../services/trading/priceOracle');

// Get trading balance
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const balance = await transferService.getTradingBalance(req.user.id);
        const summary = await tradingService.getAccountSummary(req.user.id);
        res.json({ 
            success: true, 
            balance,
            summary
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Transfer to trading (from main USDT)
router.post('/transfer/to-trading', authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        const result = await transferService.toTrading(req.user.id, amount);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Transfer to main (from trading to USDT)
router.post('/transfer/to-main', authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        const result = await transferService.toMain(req.user.id, amount);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get transfer history
router.get('/transfers', authMiddleware, async (req, res) => {
    try {
        const transfers = await transferService.getTransferHistory(req.user.id);
        res.json({ success: true, transfers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all prices
router.get('/prices', authMiddleware, (req, res) => {
    try {
        const prices = priceOracle.getAllPrices();
        res.json({ 
            success: true, 
            prices,
            timestamp: Date.now()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get price for specific asset
router.get('/price/:asset', authMiddleware, (req, res) => {
    try {
        const { asset } = req.params;
        const bid = priceOracle.getPrice(asset, 'bid');
        const ask = priceOracle.getPrice(asset, 'ask');
        const mid = priceOracle.getPrice(asset, 'mid');
        
        if (!bid || !ask) {
            return res.status(404).json({ error: 'Asset not found' });
        }
        
        res.json({
            success: true,
            asset,
            bid,
            ask,
            mid,
            spread: (ask - bid).toFixed(2)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Open position
router.post('/positions/open', authMiddleware, async (req, res) => {
    try {
        const { asset, volume, side } = req.body;
        const result = await tradingService.openPosition(req.user.id, asset, volume, side);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Close position
router.post('/positions/close', authMiddleware, async (req, res) => {
    try {
        const { positionId } = req.body;
        const result = await tradingService.closePosition(req.user.id, positionId);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get open positions
router.get('/positions/open', authMiddleware, async (req, res) => {
    try {
        const positions = await tradingService.getOpenPositions(req.user.id);
        res.json({ success: true, positions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get position history
router.get('/positions/history', authMiddleware, async (req, res) => {
    try {
        const history = await tradingService.getPositionHistory(req.user.id);
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get account summary
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const summary = await tradingService.getAccountSummary(req.user.id);
        res.json({ success: true, summary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

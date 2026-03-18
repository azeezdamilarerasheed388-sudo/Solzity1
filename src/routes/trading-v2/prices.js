const express = require('express');
const priceOracle = require('../../services/trading-v2/price-oracle');
const auth = require('../../middleware/trading-v2/auth');

const router = express.Router();

router.get('/', auth, (req, res) => {
    res.json({
        success: true,
        data: priceOracle.getAllPrices(),
        timestamp: Date.now()
    });
});

router.get('/:asset', auth, (req, res) => {
    const { asset } = req.params;
    const bid = priceOracle.getPrice(asset, 'bid');
    const ask = priceOracle.getPrice(asset, 'ask');
    const mid = priceOracle.getPrice(asset, 'mid');
    
    if (!bid || !ask) {
        return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    
    res.json({
        success: true,
        data: { 
            asset, 
            bid, 
            ask, 
            mid, 
            spread: (ask - bid).toFixed(2) 
        }
    });
});

module.exports = router;

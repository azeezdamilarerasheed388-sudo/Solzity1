const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../../config/database-supabase');
const auth = require('../../middleware/trading-v2/auth');
const priceOracle = require('../../services/trading-v2/price-oracle');

const router = express.Router();

const CONTRACTS = {
    'BTC/USDT': { size: 1 },
    'ETH/USDT': { size: 20 },
    'ETC/USDT': { size: 1000 },
    'SOL/USDT': { size: 100 }
};

const LEVERAGE = 100;
const FEE_PER_VOLUME = 15;

// Open position
router.post('/open', auth, async (req, res) => {
    const db = await getDb();
    
    try {
        const { asset, volume, side } = req.body;
        const userId = req.userId;
        
        console.log('Opening position:', { asset, volume, side, userId });
        
        if (!asset || !volume || !side) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }
        
        const price = side === 'BUY' 
            ? priceOracle.getPrice(asset, 'ask')
            : priceOracle.getPrice(asset, 'bid');
        
        if (!price || price === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Price not available' 
            });
        }
        
        await db.runAsync('BEGIN TRANSACTION');
        
        const tradingBalance = await db.getAsync(
            'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
            [userId]
        );
        
        const positionValue = volume * CONTRACTS[asset].size * price;
        const margin = positionValue / LEVERAGE;
        const fee = volume * FEE_PER_VOLUME;
        const total = margin + fee;
        
        if (!tradingBalance || tradingBalance.usdc_balance < total) {
            throw new Error(`Insufficient balance. Need $${total.toFixed(2)}`);
        }
        
        await db.runAsync(
            'UPDATE trading_v2_balances SET usdc_balance = usdc_balance - $1 WHERE user_id = $2',
            [total, userId]
        );
        
        const positionId = uuidv4();
        // FIXED: Use CURRENT_TIMESTAMP instead of Unix timestamp
        await db.runAsync(
            `INSERT INTO trading_v2_positions 
             (id, user_id, asset, volume, side, entry_price, margin, fee, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
            [positionId, userId, asset, volume, side, price, margin, fee, 'OPEN']
        );
        
        await db.runAsync('COMMIT');
        
        res.json({
            success: true,
            message: `Opened ${volume} ${asset} ${side} at $${price.toFixed(2)}`,
            data: { positionId, entryPrice: price }
        });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Open position error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Close position
router.post('/close', auth, async (req, res) => {
    const db = await getDb();
    
    try {
        const { positionId } = req.body;
        const userId = req.userId;
        
        if (!positionId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing position ID' 
            });
        }
        
        await db.runAsync('BEGIN TRANSACTION');
        
        const position = await db.getAsync(
            'SELECT * FROM trading_v2_positions WHERE id = $1 AND user_id = $2 AND status = $3',
            [positionId, userId, 'OPEN']
        );
        
        if (!position) {
            throw new Error('Position not found');
        }
        
        const currentPrice = priceOracle.getPrice(position.asset, 'mid');
        if (!currentPrice) {
            throw new Error('Price not available');
        }
        
        let priceDiff = currentPrice - position.entry_price;
        if (position.side === 'SELL') {
            priceDiff = -priceDiff;
        }
        
        const pnl = priceDiff * position.volume * CONTRACTS[position.asset].size;
        const returnAmount = position.margin + (pnl > 0 ? pnl : 0);
        
        if (returnAmount > 0) {
            await db.runAsync(
                'UPDATE trading_v2_balances SET usdc_balance = usdc_balance + $1 WHERE user_id = $2',
                [returnAmount, userId]
            );
        }
        
        // FIXED: Use CURRENT_TIMESTAMP instead of Unix timestamp
        await db.runAsync(
            `UPDATE trading_v2_positions 
             SET status = $1, 
                 pnl = $2,
                 close_price = $3,
                 closed_at = CURRENT_TIMESTAMP 
             WHERE id = $4`,
            ['CLOSED', pnl, currentPrice, positionId]
        );
        
        await db.runAsync('COMMIT');
        
        res.json({
            success: true,
            message: pnl >= 0 ? `Profit: $${pnl.toFixed(2)}` : `Loss: $${Math.abs(pnl).toFixed(2)}`,
            data: { pnl, returnAmount }
        });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Close position error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get positions
router.get('/positions', auth, async (req, res) => {
    try {
        const db = await getDb();
        const userId = req.userId;
        
        const positions = await db.allAsync(
            'SELECT * FROM trading_v2_positions WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
            [userId, 'OPEN']
        );
        
        const positionsWithPrices = positions.map(pos => ({
            ...pos,
            current_price: priceOracle.getPrice(pos.asset, 'mid') || pos.entry_price
        }));
        
        res.json({ success: true, data: positionsWithPrices });
        
    } catch (error) {
        console.error('Fetch positions error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

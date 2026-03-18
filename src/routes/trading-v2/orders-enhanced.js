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

// Open position with SL/TP
router.post('/open-enhanced', auth, async (req, res) => {
    const db = await getDb();
    
    try {
        const { asset, volume, side, stopLoss, takeProfit } = req.body;
        const userId = req.userId;
        
        console.log('Opening enhanced position:', { asset, volume, side, stopLoss, takeProfit, userId });
        
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
        
        // Validate SL/TP if provided
        if (stopLoss) {
            if (side === 'BUY' && stopLoss >= price) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Stop loss must be below entry price for BUY' 
                });
            }
            if (side === 'SELL' && stopLoss <= price) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Stop loss must be above entry price for SELL' 
                });
            }
        }
        
        if (takeProfit) {
            if (side === 'BUY' && takeProfit <= price) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Take profit must be above entry price for BUY' 
                });
            }
            if (side === 'SELL' && takeProfit >= price) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Take profit must be below entry price for SELL' 
                });
            }
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
        await db.runAsync(
            `INSERT INTO trading_v2_positions 
             (id, user_id, asset, volume, side, entry_price, stop_loss, take_profit, margin, fee, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [positionId, userId, asset, volume, side, price, stopLoss || null, takeProfit || null, margin, fee, 'OPEN', CURRENT_TIMESTAMP]
        );
        
        await db.runAsync('COMMIT');
        
        res.json({
            success: true,
            message: `Opened ${volume} ${asset} ${side} at $${price.toFixed(2)}`,
            data: { 
                positionId, 
                entryPrice: price,
                stopLoss,
                takeProfit,
                margin,
                fee
            }
        });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Open position error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get user dashboard stats
router.get('/dashboard', auth, async (req, res) => {
    try {
        const db = await getDb();
        const userId = req.userId;
        
        const tradingBalance = await db.getAsync(
            'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
            [userId]
        );
        
        const balance = Number(tradingBalance?.usdc_balance || 0);
        
        const positions = await db.allAsync(
            'SELECT * FROM trading_v2_positions WHERE user_id = $1 AND status = $2',
            [userId, 'OPEN']
        );
        
        let totalMargin = 0;
        let totalPnl = 0;
        
        if (positions && positions.length > 0) {
            for (const pos of positions) {
                totalMargin += Number(pos.margin || 0);
                
                const currentPrice = priceOracle.getPrice(pos.asset, 'mid') || Number(pos.entry_price);
                const entryPrice = Number(pos.entry_price);
                const volume = Number(pos.volume);
                
                let priceDiff = currentPrice - entryPrice;
                if (pos.side === 'SELL') {
                    priceDiff = -priceDiff;
                }
                
                const contractSize = CONTRACTS[pos.asset]?.size || 100;
                const pnl = priceDiff * volume * contractSize;
                totalPnl += pnl;
            }
        }
        
        const equity = balance + totalPnl;
        const freeMargin = equity - totalMargin;
        const marginLevel = totalMargin > 0 ? (equity / totalMargin) * 100 : 0;
        
        res.json({
            success: true,
            data: {
                balance: balance,
                equity: equity,
                margin: totalMargin,
                freeMargin: freeMargin,
                marginLevel: marginLevel,
                openPositions: positions ? positions.length : 0,
                stopOutLevel: 10
            }
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

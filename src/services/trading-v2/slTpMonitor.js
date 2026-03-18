const { getDb } = require('../../config/database-supabase');
const priceOracle = require('./price-oracle');

class SLTpMonitor {
    constructor() {
        this.isRunning = false;
        this.checkInterval = 1000;
        this.contractSizes = {
            'BTC/USDT': 1,
            'ETH/USDT': 20,
            'ETC/USDT': 1000,
            'SOL/USDT': 100
        };
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log('🎯 Stop Loss/Take Profit Monitor started - checking every second');
        setInterval(() => this.checkPositions(), this.checkInterval);
    }

    async checkPositions() {
        try {
            const db = await getDb();
            
            const positions = await db.allAsync(`
                SELECT * FROM trading_v2_positions 
                WHERE status = $1 
                AND (stop_loss IS NOT NULL OR take_profit IS NOT NULL)
            `, ['OPEN']);

            if (positions && positions.length > 0) {
                for (const position of positions) {
                    await this.checkPosition(db, position);
                }
            }
        } catch (error) {
            console.error('SL/TP check error:', error);
        }
    }

    async checkPosition(db, position) {
        const currentPrice = priceOracle.getPrice(position.asset, 'mid');
        if (!currentPrice) return;

        const stopLoss = position.stop_loss ? Number(position.stop_loss) : null;
        const takeProfit = position.take_profit ? Number(position.take_profit) : null;
        const entryPrice = Number(position.entry_price);
        
        let shouldClose = false;
        let closeReason = '';

        if (stopLoss) {
            if (position.side === 'BUY' && currentPrice <= stopLoss) {
                shouldClose = true;
                closeReason = 'Stop Loss';
            } else if (position.side === 'SELL' && currentPrice >= stopLoss) {
                shouldClose = true;
                closeReason = 'Stop Loss';
            }
        }

        if (takeProfit && !shouldClose) {
            if (position.side === 'BUY' && currentPrice >= takeProfit) {
                shouldClose = true;
                closeReason = 'Take Profit';
            } else if (position.side === 'SELL' && currentPrice <= takeProfit) {
                shouldClose = true;
                closeReason = 'Take Profit';
            }
        }

        if (shouldClose) {
            await this.closePosition(db, position, currentPrice, closeReason);
        }
    }

    async closePosition(db, position, currentPrice, reason) {
        const now = Math.floor(Date.now() / 1000); // FIXED: Calculate timestamp in JavaScript
        
        await db.runAsync('BEGIN TRANSACTION');

        try {
            const entryPrice = Number(position.entry_price);
            const volume = Number(position.volume);
            const margin = Number(position.margin);
            
            let priceDiff = currentPrice - entryPrice;
            if (position.side === 'SELL') {
                priceDiff = -priceDiff;
            }
            
            const contractSize = this.contractSizes[position.asset] || 100;
            const pnl = priceDiff * volume * contractSize;

            const returnAmount = margin + (pnl > 0 ? pnl : 0);

            if (returnAmount > 0) {
                await db.runAsync(
                    'UPDATE trading_v2_balances SET usdc_balance = usdc_balance + $1 WHERE user_id = $2',
                    [returnAmount, position.user_id]
                );
            }

            await db.runAsync(
                `UPDATE trading_v2_positions 
                 SET status = $1, 
                     pnl = $2,
                     close_reason = $3,
                     close_price = $4,
                     closed_at = $5
                 WHERE id = $6`,
                ['CLOSED', pnl, reason, currentPrice, now, position.id] // FIXED: Use JavaScript timestamp
            );

            await db.runAsync('COMMIT');

            console.log(`✅ Position ${position.id} closed by ${reason} at $${currentPrice.toFixed(2)}`);

        } catch (error) {
            await db.runAsync('ROLLBACK');
            console.error('Error closing position:', error);
        }
    }
}

module.exports = new SLTpMonitor();

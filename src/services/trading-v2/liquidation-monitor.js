const { getDb } = require('../../config/database-supabase');
const priceOracle = require('./price-oracle');

class LiquidationMonitorV2 {
    constructor() {
        this.isRunning = false;
        this.checkInterval = 1000;
        this.wss = null;
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
        
        console.log('⚠️ Liquidation Monitor V2 started - checking every second');
        setInterval(() => this.checkAllAccounts(), this.checkInterval);
    }

    setWebSocketServer(wss) {
        this.wss = wss;
    }

    async checkAllAccounts() {
        try {
            const db = await getDb();
            
            const users = await db.allAsync(
                `SELECT DISTINCT user_id FROM trading_v2_positions WHERE status = $1`,
                ['OPEN']
            );

            for (const user of users) {
                await this.checkUserLiquidation(db, user.user_id);
            }
        } catch (error) {
            console.error('Liquidation check error:', error);
        }
    }

    async checkUserLiquidation(db, userId) {
        try {
            const tradingBalance = await db.getAsync(
                'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
                [userId]
            );

            const positions = await db.allAsync(
                'SELECT * FROM trading_v2_positions WHERE user_id = $1 AND status = $2',
                [userId, 'OPEN']
            );

            if (positions.length === 0) return;

            let totalPnl = 0;
            let totalMargin = 0;

            for (const pos of positions) {
                const currentPrice = priceOracle.getPrice(pos.asset, 'mid') || pos.entry_price;
                
                const entryPrice = Number(pos.entry_price);
                const volume = Number(pos.volume);
                const margin = Number(pos.margin);
                
                let priceDiff = currentPrice - entryPrice;
                if (pos.side === 'SELL') {
                    priceDiff = -priceDiff;
                }
                
                const contractSize = this.contractSizes[pos.asset] || 1;
                const pnl = priceDiff * volume * contractSize;
                
                totalPnl += pnl;
                totalMargin += margin;
            }

            const balance = Number(tradingBalance?.usdc_balance || 0);
            const equity = balance + totalPnl;
            
            const marginLevel = totalMargin > 0 ? (equity / totalMargin) * 100 : 0;
            
            if (marginLevel <= 10) {
                console.log(`💀 LIQUIDATING user ${userId} - Margin Level: ${marginLevel.toFixed(2)}%`);
                await this.liquidateAllPositions(db, userId, positions, totalPnl);
            }

        } catch (error) {
            console.error(`Error checking user ${userId}:`, error);
        }
    }

    async liquidateAllPositions(db, userId, positions, totalPnl) {
        const now = Math.floor(Date.now() / 1000); // FIXED: Calculate timestamp in JavaScript
        
        await db.runAsync('BEGIN TRANSACTION');

        try {
            for (const pos of positions) {
                const currentPrice = priceOracle.getPrice(pos.asset, 'mid') || pos.entry_price;
                const entryPrice = Number(pos.entry_price);
                const volume = Number(pos.volume);
                
                let priceDiff = currentPrice - entryPrice;
                if (pos.side === 'SELL') {
                    priceDiff = -priceDiff;
                }
                
                const contractSize = this.contractSizes[pos.asset] || 1;
                const positionPnl = priceDiff * volume * contractSize;

                await db.runAsync(
                    `UPDATE trading_v2_positions 
                     SET status = $1, 
                         pnl = $2,
                         close_reason = $3,
                         close_price = $4,
                         closed_at = $5 
                     WHERE id = $6`,
                    ['LIQUIDATED', positionPnl, 'Liquidation', currentPrice, now, pos.id] // FIXED: Use JavaScript timestamp
                );
            }

            await db.runAsync(
                'UPDATE trading_v2_balances SET usdc_balance = 0 WHERE user_id = $1',
                [userId]
            );

            await db.runAsync('COMMIT');

            if (this.wss) {
                this.wss.clients.forEach(client => {
                    if (client.userId === userId && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'ACCOUNT_LIQUIDATION',
                            data: {
                                message: '⚠️ All positions liquidated - margin level below 10%',
                                totalLoss: Math.abs(totalPnl).toFixed(2)
                            }
                        }));
                    }
                });
            }

            console.log(`✅ User ${userId} liquidated, loss: $${Math.abs(totalPnl).toFixed(2)}`);

        } catch (error) {
            await db.runAsync('ROLLBACK');
            console.error('Liquidation error:', error);
        }
    }
}

module.exports = new LiquidationMonitorV2();

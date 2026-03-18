const { db } = require('../../config/database');
const priceOracle = require('./priceOracle');
const tradingService = require('./tradingService');

const CONTRACTS = {
    'BTC': { size: 1 },
    'ETH': { size: 20 },
    'ETC': { size: 1000 },
    'SOL': { size: 100 }
};

class LiquidationMonitor {
    constructor() {
        this.isRunning = false;
        this.checkInterval = 1000; // Check every second
        this.wss = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log('⚠️ Liquidation Monitor started - checking every second');
        setInterval(() => this.checkAllAccounts(), this.checkInterval);
    }

    setWebSocketServer(wss) {
        this.wss = wss;
    }

    async checkAllAccounts() {
        try {
            // Get all users with open positions
            const users = await db.allAsync(
                `SELECT DISTINCT user_id FROM trading_positions WHERE status = 'OPEN'`
            );

            for (const user of users) {
                await this.checkUserLiquidation(user.user_id);
            }
        } catch (error) {
            console.error('Liquidation check error:', error);
        }
    }

    async checkUserLiquidation(userId) {
        try {
            const summary = await tradingService.getAccountSummary(userId);
            
            // LIQUIDATION CONDITION: When equity ≤ 0
            if (parseFloat(summary.equity) <= 0) {
                console.log(`💀 LIQUIDATING ALL POSITIONS for user ${userId} - Equity: $${summary.equity}`);
                await this.liquidateAllPositions(userId);
            }

        } catch (error) {
            console.error(`Error checking user ${userId}:`, error);
        }
    }

    async liquidateAllPositions(userId) {
        try {
            await db.runAsync('BEGIN TRANSACTION');

            // Get all open positions
            const positions = await db.allAsync(
                'SELECT * FROM trading_positions WHERE user_id = ? AND status = "OPEN"',
                [userId]
            );

            let totalLoss = 0;

            for (const pos of positions) {
                const contract = CONTRACTS[pos.asset];
                const currentPrice = priceOracle.getPrice(pos.asset, 'mid') || pos.entry_price;
                
                let priceDiff = currentPrice - pos.entry_price;
                if (pos.side === 'SELL') {
                    priceDiff = -priceDiff;
                }
                
                const pnl = priceDiff * pos.volume * contract.size;
                totalLoss += Math.abs(pnl);

                await db.runAsync(
                    `UPDATE trading_positions 
                     SET status = 'LIQUIDATED', 
                         pnl = ?,
                         closed_at = ? 
                     WHERE id = ?`,
                    [pnl, Math.floor(Date.now() / 1000), pos.id]
                );
            }

            // Set trading balance to 0
            await db.runAsync(
                'UPDATE trading_balances SET balance = 0, updated_at = ? WHERE user_id = ?',
                [Math.floor(Date.now() / 1000), userId]
            );

            await db.runAsync('COMMIT');

            // Notify user via WebSocket
            if (this.wss) {
                this.wss.clients.forEach(client => {
                    if (client.userId === userId && client.readyState === 1) {
                        client.send(JSON.stringify({
                            type: 'LIQUIDATION',
                            data: {
                                message: '⚠️ All positions liquidated - account reached $0',
                                totalLoss: totalLoss.toFixed(2)
                            }
                        }));
                    }
                });
            }

            console.log(`✅ User ${userId} fully liquidated, total loss: $${totalLoss.toFixed(2)}`);

        } catch (error) {
            await db.runAsync('ROLLBACK');
            console.error('Liquidation error:', error);
        }
    }
}

module.exports = new LiquidationMonitor();

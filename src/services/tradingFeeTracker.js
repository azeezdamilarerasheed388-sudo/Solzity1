const { db } = require('../config/database-supabase');
const referralService = require('./referralService');

class TradingFeeTracker {
    constructor() {
        this.lastCheckedId = 0;
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log('💰 Trading fee tracker started - watching for trading fees');
        
        // Check every 30 seconds
        setInterval(() => this.checkTradingFees(), 30000);
    }

    async checkTradingFees() {
        try {
            // Look for new closed positions with fees
            const newPositions = await db.allAsync(`
                SELECT p.*, u.id as user_id
                FROM trading_v2_positions p
                JOIN users u ON p.user_id = u.id
                WHERE p.id > $1 AND p.status = $2 AND p.fee > 0
                AND NOT EXISTS (
                    SELECT 1 FROM processed_trading_fees 
                    WHERE position_id = p.id
                )
                ORDER BY p.id ASC
            `, [this.lastCheckedId, 'CLOSED']);

            for (const position of newPositions) {
                await referralService.addTradingCommission(
                    position.user_id,
                    position.fee,
                    'USDT',
                    position.id
                );
                
                console.log(`💰 Commission from trading fee: $${position.fee} USDT (User ${position.user_id})`);
                this.lastCheckedId = Math.max(this.lastCheckedId, position.id);
            }
        } catch (error) {
            console.error('Trading fee tracker error:', error);
        }
    }
}

module.exports = new TradingFeeTracker();

const cron = require('node-cron');
const { getDb } = require('../../config/database-supabase');
const { v4: uuidv4 } = require('uuid');
const priceOracle = require('./price-oracle');

class SwapFeeService {
    constructor() {
        this.swapFee = 5.00;
        this.isRunning = false;
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

        cron.schedule('0 16 * * *', () => {
            this.applySwapFees();
        }, {
            timezone: "Africa/Lagos"
        });

        console.log('⏰ Swap Fee Service started - runs daily at 4:00 PM Nigeria time');
        console.log('💰 Fixed $5 fee for users with open positions');
        console.log('⚠️  Will automatically close positions if balance is insufficient');
    }

    async applySwapFees() {
        console.log('💰 Applying daily $5 swap fees...');
        const db = await getDb();

        try {
            await db.runAsync('BEGIN TRANSACTION');

            const usersWithPositions = await db.allAsync(`
                SELECT DISTINCT user_id 
                FROM trading_v2_positions 
                WHERE status = $1
            `, ['OPEN']);

            let totalFees = 0;
            let totalPositionsClosed = 0;

            for (const user of usersWithPositions) {
                const result = await this.applyUserSwapFee(db, user.user_id);
                totalFees += result.feeCollected || 0;
                totalPositionsClosed += result.positionsClosed || 0;
            }

            await db.runAsync('COMMIT');
            
            console.log(`✅ Swap fees applied: $${totalFees.toFixed(2)} collected`);
            console.log(`📊 Positions closed to cover fees: ${totalPositionsClosed}`);

        } catch (error) {
            await db.runAsync('ROLLBACK');
            console.error('Swap fee error:', error);
        }
    }

    async applyUserSwapFee(db, userId) {
        let result = {
            feeCollected: 0,
            positionsClosed: 0
        };

        const tradingBalance = await db.getAsync(
            'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
            [userId]
        );

        let currentBalance = tradingBalance?.usdc_balance || 0;

        if (currentBalance >= this.swapFee) {
            await db.runAsync(
                'UPDATE trading_v2_balances SET usdc_balance = usdc_balance - $1 WHERE user_id = $2',
                [this.swapFee, userId]
            );

            await this.recordFee(db, userId, this.swapFee);
            
            console.log(`   User ${userId}: Charged $${this.swapFee.toFixed(2)} swap fee`);
            
            result.feeCollected = this.swapFee;
            return result;
        }

        console.log(`   ⚠️ User ${userId}: Insufficient balance ($${currentBalance}). Need $${this.swapFee}`);
        console.log(`   Closing positions to cover fee...`);

        const positions = await db.allAsync(`
            SELECT * FROM trading_v2_positions 
            WHERE user_id = $1 AND status = $2
            ORDER BY margin ASC
        `, [userId, 'OPEN']);

        let remainingFee = this.swapFee - currentBalance;
        let totalFromPositions = 0;

        for (const position of positions) {
            if (remainingFee <= 0) break;

            const closedAmount = await this.closePosition(db, position);
            totalFromPositions += closedAmount;
            result.positionsClosed++;

            remainingFee -= closedAmount;
            
            console.log(`      Closed position ${position.id}: +$${closedAmount.toFixed(2)}`);
        }

        const newBalance = currentBalance + totalFromPositions;
        
        if (newBalance >= this.swapFee) {
            await db.runAsync(
                'UPDATE trading_v2_balances SET usdc_balance = usdc_balance - $1 WHERE user_id = $2',
                [this.swapFee, userId]
            );

            await this.recordFee(db, userId, this.swapFee);
            
            console.log(`   User ${userId}: Charged $${this.swapFee.toFixed(2)} swap fee`);
            console.log(`      Closed ${result.positionsClosed} positions to cover fee`);
            
            result.feeCollected = this.swapFee;
        } else {
            const finalBalance = await db.getAsync(
                'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
                [userId]
            );

            if (finalBalance.usdc_balance > 0) {
                await db.runAsync(
                    'UPDATE trading_v2_balances SET usdc_balance = 0 WHERE user_id = $1',
                    [userId]
                );

                await this.recordFee(db, userId, finalBalance.usdc_balance);
                
                console.log(`   User ${userId}: Charged $${finalBalance.usdc_balance.toFixed(2)} (partial fee)`);
                console.log(`      Closed ${result.positionsClosed} positions`);
                
                result.feeCollected = finalBalance.usdc_balance;
            } else {
                console.log(`   User ${userId}: No balance to charge. Fee unpaid: $${this.swapFee}`);
            }
        }

        return result;
    }

    async closePosition(db, position) {
        const now = Math.floor(Date.now() / 1000); // FIXED: Calculate timestamp in JavaScript
        const currentPrice = priceOracle.getPrice(position.asset, 'mid') || position.entry_price;
        
        let priceDiff = currentPrice - position.entry_price;
        if (position.side === 'SELL') {
            priceDiff = -priceDiff;
        }
        
        const contractSize = this.contractSizes[position.asset] || 100;
        const pnl = priceDiff * position.volume * contractSize;
        
        const returnAmount = position.margin + (pnl > 0 ? pnl : 0);
        
        await db.runAsync(
            `UPDATE trading_v2_positions 
             SET status = $1, 
                 pnl = $2,
                 close_price = $3,
                 close_reason = $4,
                 closed_at = $5 
             WHERE id = $6`,
            ['CLOSED', pnl, currentPrice, 'Swap Fee', now, position.id] // FIXED: Use JavaScript timestamp
        );

        if (returnAmount > 0) {
            await db.runAsync(
                'UPDATE trading_v2_balances SET usdc_balance = usdc_balance + $1 WHERE user_id = $2',
                [returnAmount, position.user_id]
            );
        }

        return returnAmount;
    }

    async recordFee(db, userId, amount) {
        const now = Math.floor(Date.now() / 1000); // FIXED: Use JavaScript timestamp
        
        await db.runAsync(
            `INSERT INTO trading_v2_swap_fees (id, user_id, amount, created_at)
             VALUES ($1, $2, $3, $4)`,
            [uuidv4(), userId, amount, now]
        );
    }

    async getUserSwapFees(userId, days = 30) {
        const db = await getDb();
        const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
        
        return await db.allAsync(
            'SELECT * FROM trading_v2_swap_fees WHERE user_id = $1 AND created_at > $2 ORDER BY created_at DESC',
            [userId, since]
        );
    }
}

module.exports = new SwapFeeService();

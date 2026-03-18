const { v4: uuidv4 } = require('uuid');
const { db } = require('../../config/database');

class TradingTransferService {
    // Transfer USDT from main wallet to trading balance
    async toTrading(userId, amount) {
        const now = Math.floor(Date.now() / 1000);
        
        try {
            await db.runAsync('BEGIN TRANSACTION');

            // Check main wallet USDT balance
            const wallet = await db.getAsync(
                'SELECT usdt_balance FROM wallets WHERE user_id = ?',
                [userId]
            );

            if (!wallet) {
                throw new Error('Wallet not found');
            }

            if (wallet.usdt_balance < amount) {
                throw new Error(`Insufficient USDT balance. You have ${wallet.usdt_balance} USDT`);
            }

            // Deduct from main wallet
            await db.runAsync(
                'UPDATE wallets SET usdt_balance = usdt_balance - ? WHERE user_id = ?',
                [amount, userId]
            );

            // Add to trading balance
            await db.runAsync(
                `INSERT INTO trading_balances (user_id, balance, updated_at) 
                 VALUES (?, ?, ?)
                 ON CONFLICT(user_id) DO UPDATE SET 
                 balance = balance + ?,
                 updated_at = ? RETURNING id`,
                [userId, amount, now, amount, now]
            );

            // Record transfer
            const transferId = uuidv4();
            await db.runAsync(
                `INSERT INTO trading_transfers (id, user_id, direction, amount, created_at)
                 VALUES (?, ?, 'to_trading', ?, ?) RETURNING id`,
                [transferId, userId, amount, now]
            );

            await db.runAsync('COMMIT');

            return {
                success: true,
                message: `Transferred ${amount} USDT to trading balance`,
                newBalance: await this.getTradingBalance(userId)
            };

        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Transfer USDT from trading balance to main wallet
    async toMain(userId, amount) {
        const now = Math.floor(Date.now() / 1000);
        
        try {
            await db.runAsync('BEGIN TRANSACTION');

            // Check trading balance
            const tradingBalance = await this.getTradingBalance(userId);
            
            if (tradingBalance < amount) {
                throw new Error(`Insufficient trading balance. You have ${tradingBalance} USDT`);
            }

            // Check for open positions
            const openPositions = await db.getAsync(
                'SELECT COUNT(*) as count FROM trading_positions WHERE user_id = ? AND status = "OPEN"',
                [userId]
            );

            if (openPositions.count > 0) {
                throw new Error('Close all positions before withdrawing from trading');
            }

            // Deduct from trading balance
            await db.runAsync(
                'UPDATE trading_balances SET balance = balance - ?, updated_at = ? WHERE user_id = ?',
                [amount, now, userId]
            );

            // Add to main wallet USDT
            await db.runAsync(
                'UPDATE wallets SET usdt_balance = usdt_balance + ? WHERE user_id = ?',
                [amount, userId]
            );

            // Record transfer
            const transferId = uuidv4();
            await db.runAsync(
                `INSERT INTO trading_transfers (id, user_id, direction, amount, created_at)
                 VALUES (?, ?, 'to_main', ?, ?) RETURNING id`,
                [transferId, userId, amount, now]
            );

            await db.runAsync('COMMIT');

            return {
                success: true,
                message: `Transferred ${amount} USDT to main wallet`,
                newBalance: await this.getTradingBalance(userId)
            };

        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Get trading balance
    async getTradingBalance(userId) {
        const result = await db.getAsync(
            'SELECT balance FROM trading_balances WHERE user_id = ?',
            [userId]
        );
        return result?.balance || 0;
    }

    // Get transfer history
    async getTransferHistory(userId) {
        return await db.allAsync(
            `SELECT * FROM trading_transfers 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [userId]
        );
    }
}

module.exports = new TradingTransferService();

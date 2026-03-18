const { db } = require('../../config/database-supabase');

class NGNBalanceService {
    async getBalance(userId) {
        const balance = await db.getAsync(
            'SELECT balance FROM ngn_balances WHERE user_id = $1',
            [userId]
        );
        return balance?.balance || 0;
    }

    async ensureBalance(userId) {
        const exists = await db.getAsync(
            'SELECT user_id FROM ngn_balances WHERE user_id = $1',
            [userId]
        );
        
        if (!exists) {
            await db.runAsync(
                'INSERT INTO ngn_balances (user_id, balance, updated_at) VALUES ($1, $2, $3)',
                [userId, 0, Math.floor(Date.now() / 1000)]
            );
        }
    }

    async credit(userId, amount) {
        await this.ensureBalance(userId);
        
        await db.runAsync(
            'UPDATE ngn_balances SET balance = balance + $1, updated_at = $2 WHERE user_id = $3',
            [amount, Math.floor(Date.now() / 1000), userId]
        );
        
        return await this.getBalance(userId);
    }

    async debit(userId, amount) {
        await this.ensureBalance(userId);
        
        const current = await this.getBalance(userId);
        if (current < amount) {
            throw new Error('Insufficient NGN balance');
        }
        
        await db.runAsync(
            'UPDATE ngn_balances SET balance = balance - $1, updated_at = $2 WHERE user_id = $3',
            [amount, Math.floor(Date.now() / 1000), userId]
        );
        
        return await this.getBalance(userId);
    }
}

module.exports = new NGNBalanceService();

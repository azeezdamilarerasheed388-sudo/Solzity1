const { db } = require('../../config/database-supabase');
const exchangeRateService = require('./exchangeRateService');
const balanceService = require('./balanceService');
const { v4: uuidv4 } = require('uuid');

class ConversionService {
    // Buy USDC with NGN (user pays spread)
    async buyUsdc(userId, ngnAmount) {
        const { usdcAmount, rate, realRate, spread, platformProfit } = exchangeRateService.ngnToUsdc(ngnAmount);
        
        await db.runAsync('BEGIN TRANSACTION');
        
        try {
            // Check NGN balance
            const ngnBalance = await balanceService.getBalance(userId);
            if (ngnBalance < ngnAmount) {
                throw new Error('Insufficient NGN balance');
            }
            
            // Deduct NGN
            await balanceService.debit(userId, ngnAmount);
            
            // Add USDC to main wallet
            await db.runAsync(
                'UPDATE wallets SET usdc_balance = usdc_balance + $1 WHERE user_id = $2',
                [usdcAmount, userId]
            );
            
            // Record conversion
            await db.runAsync(
                `INSERT INTO ngn_conversions 
                 (user_id, type, from_amount, from_currency, to_amount, to_currency, 
                  real_rate, applied_rate, spread, platform_profit, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [userId, 'buy_usdc', ngnAmount, 'NGN', usdcAmount, 'USDC', realRate, rate, spread, platformProfit, Math.floor(Date.now() / 1000)]
            );
            
            // Record platform profit
            if (platformProfit > 0) {
                await db.runAsync(
                    `INSERT INTO platform_profits (source, amount, currency, reference_id, created_at)
                     VALUES ($1, $2, $3, $4, $5)`,
                    ['ngn_to_usdc', platformProfit, 'NGN', userId, Math.floor(Date.now() / 1000)]
                );
                console.log(`💰 Platform profit from conversion: ₦${platformProfit}`);
            }
            
            await db.runAsync('COMMIT');
            
            return {
                success: true,
                fromAmount: ngnAmount,
                fromCurrency: 'NGN',
                toAmount: usdcAmount,
                toCurrency: 'USDC',
                rate: rate,
                realRate: realRate,
                spread: spread,
                platformProfit: platformProfit
            };
            
        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Buy USDT with NGN (user pays spread)
    async buyUsdt(userId, ngnAmount) {
        const { usdtAmount, rate, realRate, spread, platformProfit } = exchangeRateService.ngnToUsdt(ngnAmount);
        
        await db.runAsync('BEGIN TRANSACTION');
        
        try {
            const ngnBalance = await balanceService.getBalance(userId);
            if (ngnBalance < ngnAmount) {
                throw new Error('Insufficient NGN balance');
            }
            
            await balanceService.debit(userId, ngnAmount);
            
            await db.runAsync(
                'UPDATE wallets SET usdt_balance = usdt_balance + $1 WHERE user_id = $2',
                [usdtAmount, userId]
            );
            
            await db.runAsync(
                `INSERT INTO ngn_conversions 
                 (user_id, type, from_amount, from_currency, to_amount, to_currency, 
                  real_rate, applied_rate, spread, platform_profit, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [userId, 'buy_usdt', ngnAmount, 'NGN', usdtAmount, 'USDT', realRate, rate, spread, platformProfit, Math.floor(Date.now() / 1000)]
            );
            
            if (platformProfit > 0) {
                await db.runAsync(
                    `INSERT INTO platform_profits (source, amount, currency, reference_id, created_at)
                     VALUES ($1, $2, $3, $4, $5)`,
                    ['ngn_to_usdt', platformProfit, 'NGN', userId, Math.floor(Date.now() / 1000)]
                );
            }
            
            await db.runAsync('COMMIT');
            
            return {
                success: true,
                fromAmount: ngnAmount,
                fromCurrency: 'NGN',
                toAmount: usdtAmount,
                toCurrency: 'USDT',
                rate: rate,
                realRate: realRate,
                spread: spread,
                platformProfit: platformProfit
            };
            
        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Sell USDC for NGN (user gets real rate, no spread)
    async sellUsdc(userId, usdcAmount) {
        const { ngnAmount, rate, realRate } = exchangeRateService.usdcToNgn(usdcAmount);
        
        await db.runAsync('BEGIN TRANSACTION');
        
        try {
            // Check USDC balance
            const wallet = await db.getAsync(
                'SELECT usdc_balance FROM wallets WHERE user_id = $1',
                [userId]
            );
            
            if (!wallet || wallet.usdc_balance < usdcAmount) {
                throw new Error('Insufficient USDC balance');
            }
            
            // Deduct USDC
            await db.runAsync(
                'UPDATE wallets SET usdc_balance = usdc_balance - $1 WHERE user_id = $2',
                [usdcAmount, userId]
            );
            
            // Add NGN
            await balanceService.credit(userId, ngnAmount);
            
            // Record conversion
            await db.runAsync(
                `INSERT INTO ngn_conversions 
                 (user_id, type, from_amount, from_currency, to_amount, to_currency, 
                  real_rate, applied_rate, spread, platform_profit, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [userId, 'sell_usdc', usdcAmount, 'USDC', ngnAmount, 'NGN', realRate, rate, 0, 0, Math.floor(Date.now() / 1000)]
            );
            
            await db.runAsync('COMMIT');
            
            return {
                success: true,
                fromAmount: usdcAmount,
                fromCurrency: 'USDC',
                toAmount: ngnAmount,
                toCurrency: 'NGN',
                rate: rate,
                realRate: realRate,
                spread: 0,
                platformProfit: 0
            };
            
        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Sell USDT for NGN (user gets real rate, no spread)
    async sellUsdt(userId, usdtAmount) {
        const { ngnAmount, rate, realRate } = exchangeRateService.usdtToNgn(usdtAmount);
        
        await db.runAsync('BEGIN TRANSACTION');
        
        try {
            const wallet = await db.getAsync(
                'SELECT usdt_balance FROM wallets WHERE user_id = $1',
                [userId]
            );
            
            if (!wallet || wallet.usdt_balance < usdtAmount) {
                throw new Error('Insufficient USDT balance');
            }
            
            await db.runAsync(
                'UPDATE wallets SET usdt_balance = usdt_balance - $1 WHERE user_id = $2',
                [usdtAmount, userId]
            );
            
            await balanceService.credit(userId, ngnAmount);
            
            await db.runAsync(
                `INSERT INTO ngn_conversions 
                 (user_id, type, from_amount, from_currency, to_amount, to_currency, 
                  real_rate, applied_rate, spread, platform_profit, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [userId, 'sell_usdt', usdtAmount, 'USDT', ngnAmount, 'NGN', realRate, rate, 0, 0, Math.floor(Date.now() / 1000)]
            );
            
            await db.runAsync('COMMIT');
            
            return {
                success: true,
                fromAmount: usdtAmount,
                fromCurrency: 'USDT',
                toAmount: ngnAmount,
                toCurrency: 'NGN',
                rate: rate,
                realRate: realRate,
                spread: 0,
                platformProfit: 0
            };
            
        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Get conversion history
    async getHistory(userId, limit = 50) {
        return await db.allAsync(
            `SELECT * FROM ngn_conversions 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [userId, limit]
        );
    }

    // Get platform profits (admin only)
    async getPlatformProfits(days = 30) {
        const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
        return await db.allAsync(
            `SELECT * FROM platform_profits 
             WHERE created_at > $1 
             ORDER BY created_at DESC`,
            [since]
        );
    }
}

module.exports = new ConversionService();

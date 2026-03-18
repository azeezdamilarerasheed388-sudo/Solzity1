const { db } = require('../config/database-supabase');
const crypto = require('crypto');

class ReferralService {
    constructor() {
        // Tier 1: 0-4 referrals → 10%
        // Tier 2: 5-19 referrals → 12%
        // Tier 3: 20-49 referrals → 15%
        // Tier 4: 50+ referrals → 20%
        this.tiers = {
            1: { commission: 10, requirement: 0 },
            2: { commission: 12, requirement: 5 },
            3: { commission: 15, requirement: 20 },
            4: { commission: 20, requirement: 50 }
        };
    }

    // Generate unique referral code
    generateCode(userId, username) {
        const random = crypto.randomBytes(4).toString('hex');
        const base = username ? username.substring(0, 6) : `user${userId}`;
        return `${base}_${random}`.toUpperCase();
    }

    // Create referral code for user
    async createReferralCode(userId, username) {
        const existing = await db.getAsync(
            'SELECT * FROM referral_codes WHERE user_id = $1',
            [userId]
        );
        
        if (existing) {
            return existing;
        }

        const code = this.generateCode(userId, username);
        const now = Math.floor(Date.now() / 1000);

        await db.runAsync(
            'INSERT INTO referral_codes (user_id, code, created_at) VALUES ($1, $2, $3)',
            [userId, code, now]
        );

        // Initialize referral balance
        await db.runAsync(
            `INSERT INTO referral_balances (user_id, usdc_balance, usdt_balance, updated_at) 
             VALUES ($1, $2, $2, $3)`,
            [userId, 0, now]
        );

        return { userId, code };
    }

    // Get referral code for user
    async getReferralCode(userId) {
        return await db.getAsync(
            'SELECT * FROM referral_codes WHERE user_id = $1',
            [userId]
        );
    }

    // Track new referral
    async trackReferral(referrerCode, referredId) {
        const referrer = await db.getAsync(
            'SELECT * FROM referral_codes WHERE code = $1',
            [referrerCode]
        );

        if (!referrer) {
            return null;
        }

        // Check if already referred
        const existing = await db.getAsync(
            'SELECT * FROM referrals WHERE referred_id = $1',
            [referredId]
        );

        if (existing) {
            return null;
        }

        const now = Math.floor(Date.now() / 1000);

        await db.runAsync(
            'INSERT INTO referrals (referrer_id, referred_id, code, created_at) VALUES ($1, $2, $3, $4)',
            [referrer.user_id, referredId, referrerCode, now]
        );

        // Update referrer tier
        await this.updateTier(referrer.user_id);

        return referrer.user_id;
    }

    // Get user's tier and commission percentage
    async getUserTier(userId) {
        const code = await db.getAsync(
            'SELECT tier FROM referral_codes WHERE user_id = $1',
            [userId]
        );
        
        const tier = code?.tier || 1;
        return {
            tier,
            percentage: this.tiers[tier].commission
        };
    }

    // Update user's tier based on referral count
    async updateTier(userId) {
        const referralCount = await db.getAsync(
            'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1',
            [userId]
        );

        const count = parseInt(referralCount?.count) || 0;
        
        let newTier = 1;
        for (let tier = 4; tier >= 1; tier--) {
            if (count >= this.tiers[tier].requirement) {
                newTier = tier;
                break;
            }
        }

        await db.runAsync(
            'UPDATE referral_codes SET tier = $1 WHERE user_id = $2',
            [newTier, userId]
        );

        return newTier;
    }

    // Add commission from trading fee
    async addTradingCommission(referredUserId, tradingFee, token, positionId) {
        // Check if already processed
        const processed = await db.getAsync(
            'SELECT * FROM processed_trading_fees WHERE position_id = $1',
            [positionId]
        );

        if (processed) {
            return null;
        }

        // Get referrer from referrals
        const referral = await db.getAsync(
            'SELECT referrer_id FROM referrals WHERE referred_id = $1',
            [referredUserId]
        );

        if (!referral) {
            return null;
        }

        const referrerId = referral.referrer_id;

        // Get referrer's tier and commission percentage
        const { tier, percentage } = await this.getUserTier(referrerId);
        const commissionAmount = (tradingFee * percentage) / 100;

        const now = Math.floor(Date.now() / 1000);

        // Record commission
        await db.runAsync(
            `INSERT INTO referral_commissions 
             (referrer_id, referred_id, amount, token, tier, percentage, created_at, position_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [referrerId, referredUserId, commissionAmount, token, tier, percentage, now, positionId]
        );

        // Add to referral balance
        const balanceCol = `${token.toLowerCase()}_balance`;
        await db.runAsync(
            `INSERT INTO referral_balances (user_id, ${balanceCol}, updated_at)
             VALUES ($1, $2, $3)
             ON CONFLICT(user_id) DO UPDATE SET 
             ${balanceCol} = referral_balances.${balanceCol} + $2,
             updated_at = $3`,
            [referrerId, commissionAmount, now]
        );

        // Mark as processed
        await db.runAsync(
            'INSERT INTO processed_trading_fees (position_id, processed_at) VALUES ($1, $2)',
            [positionId, now]
        );

        return {
            referrerId,
            commission: commissionAmount,
            token,
            tier,
            percentage
        };
    }

    // Get referral balance
    async getReferralBalance(userId) {
        return await db.getAsync(
            'SELECT usdc_balance, usdt_balance FROM referral_balances WHERE user_id = $1',
            [userId]
        );
    }

    // Transfer from referral balance to main wallet
    async transferToMain(userId, token, amount) {
        const now = Math.floor(Date.now() / 1000);
        const balanceCol = `${token.toLowerCase()}_balance`;

        await db.runAsync('BEGIN TRANSACTION');

        try {
            // Check referral balance
            const balance = await db.getAsync(
                `SELECT ${balanceCol} FROM referral_balances WHERE user_id = $1`,
                [userId]
            );

            if (!balance || parseFloat(balance[balanceCol] || 0) < amount) {
                throw new Error(`Insufficient ${token} referral balance`);
            }

            // Deduct from referral balance
            await db.runAsync(
                `UPDATE referral_balances SET ${balanceCol} = ${balanceCol} - $1, updated_at = $2 WHERE user_id = $3`,
                [amount, now, userId]
            );

            // Add to main wallet
            if (token === 'USDC') {
                await db.runAsync(
                    'UPDATE wallets SET usdc_balance = usdc_balance + $1 WHERE user_id = $2',
                    [amount, userId]
                );
            } else if (token === 'USDT') {
                await db.runAsync(
                    'UPDATE wallets SET usdt_balance = usdt_balance + $1 WHERE user_id = $2',
                    [amount, userId]
                );
            } else {
                throw new Error('Only USDC and USDT can be transferred');
            }

            // Record payout
            await db.runAsync(
                `INSERT INTO referral_payouts (user_id, from_token, to_token, amount, net_amount, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, token, token, amount, amount, now]
            );

            // Update commission status
            await db.runAsync(
                `UPDATE referral_commissions 
                 SET status = 'paid', paid_at = $1 
                 WHERE referrer_id = $2 AND token = $3 AND status = 'pending'`,
                [now, userId, token]
            );

            await db.runAsync('COMMIT');

            return {
                success: true,
                amount,
                token,
                message: `Transferred ${amount} ${token} to main wallet`
            };

        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Get referral statistics
    async getReferralStats(userId) {
        const stats = {};

        // Total referrals
        const totalRefs = await db.getAsync(
            'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1',
            [userId]
        );
        stats.totalReferrals = parseInt(totalRefs?.count) || 0;

        // Active referrals (have made trades)
        const activeRefs = await db.getAsync(`
            SELECT COUNT(DISTINCT r.referred_id) as count
            FROM referrals r
            JOIN trading_v2_positions p ON r.referred_id = p.user_id
            WHERE r.referrer_id = $1
        `, [userId]);
        stats.activeReferrals = parseInt(activeRefs?.count) || 0;

        // Total commissions earned
        const totalCommissions = await db.getAsync(
            'SELECT COALESCE(SUM(amount), 0) as total FROM referral_commissions WHERE referrer_id = $1',
            [userId]
        );
        stats.totalCommissions = parseFloat(totalCommissions?.total) || 0;

        // Pending commissions
        const pendingCommissions = await db.getAsync(
            'SELECT COALESCE(SUM(amount), 0) as total FROM referral_commissions WHERE referrer_id = $1 AND status = $2',
            [userId, 'pending']
        );
        stats.pendingCommissions = parseFloat(pendingCommissions?.total) || 0;

        // Paid commissions
        const paidCommissions = await db.getAsync(
            'SELECT COALESCE(SUM(amount), 0) as total FROM referral_commissions WHERE referrer_id = $1 AND status = $2',
            [userId, 'paid']
        );
        stats.paidCommissions = parseFloat(paidCommissions?.total) || 0;

        // Current tier
        const code = await db.getAsync(
            'SELECT tier FROM referral_codes WHERE user_id = $1',
            [userId]
        );
        stats.currentTier = code?.tier || 1;
        stats.currentCommission = this.tiers[stats.currentTier].commission;

        // Next tier info
        if (stats.currentTier < 4) {
            stats.nextTier = stats.currentTier + 1;
            stats.nextTierCommission = this.tiers[stats.nextTier].commission;
            stats.nextTierRequirement = this.tiers[stats.nextTier].requirement;
            stats.neededForNextTier = Math.max(0, stats.nextTierRequirement - stats.totalReferrals);
        }

        // Commissions by token
        const byToken = await db.allAsync(
            'SELECT token, COALESCE(SUM(amount), 0) as total FROM referral_commissions WHERE referrer_id = $1 GROUP BY token',
            [userId]
        );
        stats.byToken = byToken.reduce((acc, curr) => {
            acc[curr.token] = parseFloat(curr.total);
            return acc;
        }, {});

        return stats;
    }

    // Get referral link
    async getReferralLink(userId) {
        const code = await db.getAsync(
            'SELECT code FROM referral_codes WHERE user_id = $1',
            [userId]
        );

        if (!code) {
            return null;
        }

        return {
            code: code.code,
            link: `${process.env.BASE_URL || 'http://localhost:3000'}/register-enhanced?ref=${code.code}`
        };
    }

    // Get recent commissions
    async getRecentCommissions(userId, limit = 20) {
        return await db.allAsync(`
            SELECT c.*, u.username as referred_username
            FROM referral_commissions c
            JOIN users u ON c.referred_id = u.id
            WHERE c.referrer_id = $1
            ORDER BY c.created_at DESC
            LIMIT $2
        `, [userId, limit]);
    }
}

module.exports = new ReferralService();

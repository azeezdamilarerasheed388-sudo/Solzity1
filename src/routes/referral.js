const express = require('express');
const router = express.Router();
const { db } = require('../config/database-supabase');
const { authMiddleware } = require('../middleware/auth');
const referralService = require('../services/referralService');

// Get referral link and stats
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get or create referral code
        let code = await referralService.getReferralCode(userId);
        if (!code) {
            await referralService.createReferralCode(userId, req.user.username);
            code = await referralService.getReferralCode(userId);
        }

        const link = await referralService.getReferralLink(userId);
        const stats = await referralService.getReferralStats(userId);
        const balance = await referralService.getReferralBalance(userId);

        res.json({
            success: true,
            data: {
                code: code.code,
                link: link.link,
                tier: code.tier,
                stats,
                balance: {
                    usdc: balance?.usdc_balance || 0,
                    usdt: balance?.usdt_balance || 0
                }
            }
        });
    } catch (error) {
        console.error('Referral error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get recent commissions
router.get('/commissions', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const commissions = await referralService.getRecentCommissions(userId);
        
        res.json({
            success: true,
            data: commissions
        });
    } catch (error) {
        console.error('Commissions error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Transfer from referral balance to main
router.post('/transfer', authMiddleware, async (req, res) => {
    try {
        const { token, amount } = req.body;
        const userId = req.user.id;

        if (!token || !amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Token and amount are required' 
            });
        }

        if (!['USDC', 'USDT'].includes(token)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Only USDC and USDT can be transferred' 
            });
        }

        const result = await referralService.transferToMain(userId, token, amount);

        res.json({
            success: true,
            message: result.message,
            data: result
        });
    } catch (error) {
        console.error('Transfer error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get tier info
router.get('/tiers', (req, res) => {
    const tiers = [
        { tier: 1, commission: 10, requirement: 0, description: '0-4 referrals' },
        { tier: 2, commission: 12, requirement: 5, description: '5-19 referrals' },
        { tier: 3, commission: 15, requirement: 20, description: '20-49 referrals' },
        { tier: 4, commission: 20, requirement: 50, description: '50+ referrals' }
    ];
    
    res.json({ success: true, data: tiers });
});

module.exports = router;

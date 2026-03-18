const express = require('express');
const router = express.Router();
const { db } = require('../../config/database-supabase');
const { authMiddleware } = require('../../middleware/auth');
const { adminMiddleware } = require('../../middleware/admin');
const exchangeRateService = require('../../services/ngn/exchangeRateService');
const balanceService = require('../../services/ngn/balanceService');
const paystackService = require('../../services/ngn/paystackService');
const conversionService = require('../../services/ngn/conversionService');

// Get NGN balance
router.get('/balance', authMiddleware, async (req, res) => {
    try {
        const balance = await balanceService.getBalance(req.user.id);
        res.json({ success: true, balance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get exchange rates
router.get('/rate', (req, res) => {
    res.json({
        success: true,
        real: exchangeRateService.getRealRate(),
        buy: exchangeRateService.getBuyRate(),
        sell: exchangeRateService.getSellRate(),
        spread: exchangeRateService.spread
    });
});

// Deposit endpoints
router.post('/deposit/initialize', authMiddleware, async (req, res) => {
    try {
        const { ngnAmount } = req.body;
        
        if (!ngnAmount || ngnAmount < 100) {
            return res.status(400).json({ 
                success: false, 
                error: 'Minimum deposit is ₦100' 
            });
        }

        const result = await paystackService.initializeDeposit(
            req.user.id,
            req.user.email,
            ngnAmount
        );

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Deposit callback
router.get('/deposit/callback', async (req, res) => {
    const { reference, trxref } = req.query;
    const txRef = reference || trxref;
    
    console.log(`📞 Deposit callback received: ${txRef}`);
    
    if (!txRef) {
        return res.redirect('/ngn$1status=error&message=No reference');
    }

    const result = await paystackService.verifyDeposit(txRef);
    
    if (result.success) {
        res.redirect(`/ngn$1status=success&amount=${result.amount}`);
    } else {
        res.redirect('/ngn$1status=failed');
    }
});

// Deposit history
router.get('/deposits', authMiddleware, async (req, res) => {
    try {
        const deposits = await db.allAsync(
            `SELECT * FROM ngn_deposits 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [req.user.id]
        );
        res.json({ success: true, data: deposits });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get banks
router.get('/banks', async (req, res) => {
    try {
        const banks = await paystackService.getBanks();
        res.json({ success: true, data: banks });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// FIXED: Verify account - always fresh verification
router.post('/verify-account', async (req, res) => {
    try {
        const { accountNumber, bankCode } = req.body;
        
        console.log(`🔍 Verifying account: ${accountNumber} with bank: ${bankCode}`);
        
        if (!accountNumber || !bankCode) {
            return res.status(400).json({ 
                success: false, 
                error: 'Account number and bank code are required' 
            });
        }

        // Always call Paystack fresh - no caching
        const result = await paystackService.verifyAccount(accountNumber, bankCode);
        
        if (result.success) {
            res.json({ 
                success: true, 
                accountName: result.accountName 
            });
        } else {
            res.status(400).json({ 
                success: false, 
                error: result.error || 'Verification failed' 
            });
        }
    } catch (error) {
        console.error('Verification endpoint error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error during verification' 
        });
    }
});

// Withdraw NGN
router.post('/withdraw/initiate', authMiddleware, async (req, res) => {
    try {
        const { ngnAmount, bankCode, accountNumber, accountName } = req.body;
        
        if (!ngnAmount || ngnAmount < 1000) {
            return res.status(400).json({ 
                success: false, 
                error: 'Minimum withdrawal is ₦1,000' 
            });
        }

        // Always verify fresh before withdrawal
        const verifyResult = await paystackService.verifyAccount(accountNumber, bankCode);
        if (!verifyResult.success) {
            return res.status(400).json({ 
                success: false, 
                error: 'Please verify your account details first' 
            });
        }

        const result = await paystackService.initiateWithdrawal(
            req.user.id,
            ngnAmount,
            bankCode,
            accountNumber,
            verifyResult.accountName
        );

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Withdrawal history
router.get('/withdrawals', authMiddleware, async (req, res) => {
    try {
        const withdrawals = await db.allAsync(
            `SELECT * FROM ngn_withdrawals 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [req.user.id]
        );
        res.json({ success: true, data: withdrawals });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Buy USDC
router.post('/buy/usdc', authMiddleware, async (req, res) => {
    try {
        const { ngnAmount } = req.body;
        const result = await conversionService.buyUsdc(req.user.id, ngnAmount);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Buy USDT
router.post('/buy/usdt', authMiddleware, async (req, res) => {
    try {
        const { ngnAmount } = req.body;
        const result = await conversionService.buyUsdt(req.user.id, ngnAmount);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Sell USDC
router.post('/sell/usdc', authMiddleware, async (req, res) => {
    try {
        const { usdcAmount } = req.body;
        const result = await conversionService.sellUsdc(req.user.id, usdcAmount);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Sell USDT
router.post('/sell/usdt', authMiddleware, async (req, res) => {
    try {
        const { usdtAmount } = req.body;
        const result = await conversionService.sellUsdt(req.user.id, usdtAmount);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Conversion history
router.get('/conversions', authMiddleware, async (req, res) => {
    try {
        const history = await conversionService.getHistory(req.user.id);
        res.json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get platform profits
router.get('/admin/profits', adminMiddleware, async (req, res) => {
    try {
        const profits = await conversionService.getPlatformProfits();
        const total = profits.reduce((sum, p) => sum + p.amount, 0);
        res.json({ success: true, total, profits });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

// ==================== ADMIN NGN ROUTES ====================

// Get pending withdrawals
router.get('/admin/withdrawals/pending', adminMiddleware, async (req, res) => {
    try {
        const withdrawals = await db.allAsync(
            `SELECT * FROM ngn_withdrawals 
             WHERE status = 'pending' 
             ORDER BY created_at ASC`
        );
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('Error fetching pending withdrawals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get completed withdrawals
router.get('/admin/withdrawals/completed', adminMiddleware, async (req, res) => {
    try {
        const withdrawals = await db.allAsync(
            `SELECT * FROM ngn_withdrawals 
             WHERE status = 'completed' 
             ORDER BY created_at DESC 
             LIMIT 100`
        );
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('Error fetching completed withdrawals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get rejected withdrawals
router.get('/admin/withdrawals/rejected', adminMiddleware, async (req, res) => {
    try {
        const withdrawals = await db.allAsync(
            `SELECT * FROM ngn_withdrawals 
             WHERE status = 'rejected' 
             ORDER BY created_at DESC 
             LIMIT 100`
        );
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('Error fetching rejected withdrawals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all withdrawals (for history tab)
router.get('/admin/withdrawals/all', adminMiddleware, async (req, res) => {
    try {
        const withdrawals = await db.allAsync(
            `SELECT * FROM ngn_withdrawals 
             ORDER BY created_at DESC 
             LIMIT 500`
        );
        res.json({ success: true, withdrawals });
    } catch (error) {
        console.error('Error fetching all withdrawals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get withdrawal statistics
router.get('/admin/stats', adminMiddleware, async (req, res) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        const today = now - (24 * 60 * 60);
        const week = now - (7 * 24 * 60 * 60);
        const month = now - (30 * 24 * 60 * 60);

        // Pending count
        const pending = await db.getAsync(
            `SELECT COUNT(*) as count FROM ngn_withdrawals WHERE status = 'pending'`
        );

        // Today's total
        const todayTotal = await db.getAsync(
            `SELECT COALESCE(SUM(ngn_amount), 0) as total FROM ngn_withdrawals 
             WHERE status = 'completed' AND created_at > $1`,
            [today]
        );

        // Week's total
        const weekTotal = await db.getAsync(
            `SELECT COALESCE(SUM(ngn_amount), 0) as total FROM ngn_withdrawals 
             WHERE status = 'completed' AND created_at > $1`,
            [week]
        );

        // Month's total
        const monthTotal = await db.getAsync(
            `SELECT COALESCE(SUM(ngn_amount), 0) as total FROM ngn_withdrawals 
             WHERE status = 'completed' AND created_at > $1`,
            [month]
        );

        res.json({
            success: true,
            stats: {
                pending: pending$1.count || 0,
                today: todayTotal$1.total || 0,
                week: weekTotal$1.total || 0,
                month: monthTotal$1.total || 0
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Approve withdrawal
router.post('/admin/withdrawals/approve', adminMiddleware, async (req, res) => {
    const { id, reference } = req.body;
    
    try {
        await db.runAsync('BEGIN TRANSACTION');
        
        // Check if withdrawal exists and is pending
        const withdrawal = await db.getAsync(
            "SELECT * FROM ngn_withdrawals WHERE id = $1 AND status = 'pending'",
            [id]
        );
        
        if (!withdrawal) {
            await db.runAsync('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Withdrawal not found or already processed' });
        }
        
        // Update withdrawal status
        await db.runAsync(
            `UPDATE ngn_withdrawals 
             SET status = 'completed', 
                 processed_at = $1,
                 tx_reference = $2
             WHERE id = $3`,
            [Math.floor(Date.now() / 1000), reference || null, id]
        );
        
        await db.runAsync('COMMIT');
        
        res.json({ success: true, message: 'Withdrawal approved successfully' });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Error approving withdrawal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reject withdrawal (refund)
router.post('/admin/withdrawals/reject', adminMiddleware, async (req, res) => {
    const { id, reason } = req.body;
    
    try {
        await db.runAsync('BEGIN TRANSACTION');
        
        // Get withdrawal
        const withdrawal = await db.getAsync(
            "SELECT * FROM ngn_withdrawals WHERE id = $1 AND status = 'pending'",
            [id]
        );
        
        if (!withdrawal) {
            await db.runAsync('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Withdrawal not found or already processed' });
        }
        
        // Update withdrawal status
        await db.runAsync(
            `UPDATE ngn_withdrawals 
             SET status = 'rejected', 
                 rejection_reason = $1,
                 processed_at = $1
             WHERE id = $1`,
            [reason || 'Rejected by admin', Math.floor(Date.now() / 1000), id]
        );
        
        // Refund user's NGN balance
        const balanceService = require('../../services/ngn/balanceService');
        await balanceService.credit(withdrawal.user_id, withdrawal.ngn_amount);
        
        await db.runAsync('COMMIT');
        
        res.json({ success: true, message: 'Withdrawal rejected and funds refunded' });
        
    } catch (error) {
        await db.runAsync('ROLLBACK');
        console.error('Error rejecting withdrawal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

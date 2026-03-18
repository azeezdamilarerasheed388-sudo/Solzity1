const express = require('express');
const router = express.Router();
const { db } = require('../../config/database-supabase');
const { adminMiddleware } = require('../../middleware/admin');

router.get('/', adminMiddleware, async (req, res) => {
    try {
        console.log('📊 Fetching platform stats...');
        
        // 1. Total Users
        const totalUsers = await db.getAsync('SELECT COUNT(*) as count FROM users');
        console.log('✅ Total users:', totalUsers?.count);
        
        // 2. Total Deposits
        const deposits = await db.getAsync(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM deposits 
            WHERE status = $1
        `, ['confirmed']);
        console.log('✅ Total deposits:', deposits?.total);
        
        // 3. Withdrawal stats
        const withdrawalStats = await db.getAsync(`
            SELECT 
                COALESCE(SUM(amount), 0) as total_amount,
                COALESCE(SUM(fee), 0) as total_fees
            FROM withdrawals 
            WHERE status = $1 OR status = $2
        `, ['completed', 'failed']);
        console.log('✅ Withdrawal fees:', withdrawalStats?.total_fees);
        
        // 4. Transfer fees
        const transferFees = await db.getAsync(`
            SELECT COALESCE(SUM(fee), 0) as total 
            FROM transfers
        `);
        console.log('✅ Transfer fees:', transferFees?.total);
        
        // 5. Trading fees
        const tradingFees = await db.getAsync(`
            SELECT COALESCE(SUM(fee), 0) as total 
            FROM trading_v2_positions 
            WHERE status = $1
        `, ['CLOSED']);
        console.log('✅ Trading fees:', tradingFees?.total);
        
        // 6. Trading P&L
        const tradingPnl = await db.getAsync(`
            SELECT 
                COALESCE(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END), 0) as total_profit,
                COALESCE(SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END), 0) as total_loss,
                COALESCE(SUM(pnl), 0) as net_pnl
            FROM trading_v2_positions 
            WHERE status = $1
        `, ['CLOSED']);
        console.log('✅ Trading P&L:', tradingPnl?.net_pnl);
        
        // 7. Open positions count
        const openPositions = await db.getAsync(`
            SELECT COUNT(*) as count 
            FROM trading_v2_positions 
            WHERE status = $1
        `, ['OPEN']);
        console.log('✅ Open positions:', openPositions?.count);
        
        // 8. Trading_v2_transfers
        const tradingTransfers = await db.getAsync(`
            SELECT COUNT(*) as count,
                   COALESCE(SUM(amount), 0) as total
            FROM trading_v2_transfers
        `);
        console.log('✅ Trading transfers:', tradingTransfers?.count);
        
        // Calculate total revenue
        const totalRevenue = (withdrawalStats?.total_fees || 0) + 
                             (transferFees?.total || 0) + 
                             (tradingFees?.total || 0);
        
        res.json({
            success: true,
            stats: {
                // User stats
                totalUsers: totalUsers?.count || 0,
                
                // Financial stats
                totalDeposits: deposits?.total || 0,
                totalWithdrawals: withdrawalStats?.total_amount || 0,
                
                // Fee stats
                withdrawalFees: withdrawalStats?.total_fees || 0,
                transferFees: transferFees?.total || 0,
                tradingFees: tradingFees?.total || 0,
                swapFees: 0,
                totalRevenue: totalRevenue,
                
                // Trading stats
                openPositions: openPositions?.count || 0,
                totalProfit: tradingPnl?.total_profit || 0,
                totalLoss: tradingPnl?.total_loss || 0,
                netPnl: tradingPnl?.net_pnl || 0,
                
                // Additional stats
                totalTradingTransfers: tradingTransfers?.count || 0,
                tradingTransferVolume: tradingTransfers?.total || 0
            }
        });
        
    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

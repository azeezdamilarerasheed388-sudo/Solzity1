const { v4: uuidv4 } = require('uuid');
const { db } = require('../../config/database');
const priceOracle = require('./priceOracle');
const transferService = require('./transferService');

// Contract sizes from the documents
const CONTRACTS = {
    'BTC': { size: 1, min: 0.001, max: 100 },
    'ETH': { size: 20, min: 0.01, max: 1000 },
    'ETC': { size: 1000, min: 0.1, max: 10000 },
    'SOL': { size: 100, min: 0.1, max: 10000 }
};

const LEVERAGE = 100;
const FEE_PER_VOLUME = 15; // $15 per volume unit

class TradingService {
    // Open a new position
    async openPosition(userId, asset, volume, side) {
        const now = Math.floor(Date.now() / 1000);
        
        try {
            await db.runAsync('BEGIN TRANSACTION');

            // Validate asset
            if (!CONTRACTS[asset]) {
                throw new Error('Invalid asset. Must be BTC, ETH, ETC, or SOL');
            }

            // Validate volume
            const contract = CONTRACTS[asset];
            if (volume < contract.min || volume > contract.max) {
                throw new Error(`Volume must be between ${contract.min} and ${contract.max}`);
            }

            // Get current price from oracle
            const price = side === 'BUY' 
                ? priceOracle.getPrice(asset, 'ask')
                : priceOracle.getPrice(asset, 'bid');

            if (!price || price === 0) {
                throw new Error('Price not available');
            }

            // Check trading balance
            const tradingBalance = await transferService.getTradingBalance(userId);
            
            const positionValue = volume * contract.size * price;
            const margin = positionValue / LEVERAGE;
            const fee = volume * FEE_PER_VOLUME;
            const totalRequired = margin + fee;

            if (tradingBalance < totalRequired) {
                throw new Error(`Insufficient trading balance. Need $${totalRequired.toFixed(2)} USDT`);
            }

            // Deduct from trading balance
            await db.runAsync(
                'UPDATE trading_balances SET balance = balance - ?, updated_at = ? WHERE user_id = ?',
                [totalRequired, now, userId]
            );

            // Create position
            const positionId = uuidv4();
            await db.runAsync(
                `INSERT INTO trading_positions 
                 (id, user_id, asset, volume, side, entry_price, margin, fee, created_at, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN') RETURNING id`,
                [positionId, userId, asset, volume, side, price, margin, fee, now]
            );

            await db.runAsync('COMMIT');

            return {
                success: true,
                positionId,
                entryPrice: price,
                margin,
                fee,
                message: `Opened ${volume} ${asset} ${side} at $${price.toFixed(2)}`
            };

        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Close a position
    async closePosition(userId, positionId) {
        const now = Math.floor(Date.now() / 1000);
        
        try {
            await db.runAsync('BEGIN TRANSACTION');

            // Get position
            const position = await db.getAsync(
                'SELECT * FROM trading_positions WHERE id = ? AND user_id = ? AND status = "OPEN"',
                [positionId, userId]
            );

            if (!position) {
                throw new Error('Position not found');
            }

            // Get current price
            const contract = CONTRACTS[position.asset];
            const currentPrice = priceOracle.getPrice(position.asset, 'mid');

            if (!currentPrice) {
                throw new Error('Price not available');
            }

            // Calculate P&L
            let priceDiff = currentPrice - position.entry_price;
            if (position.side === 'SELL') {
                priceDiff = -priceDiff;
            }
            
            const pnl = priceDiff * position.volume * contract.size;

            // Return margin + profit (if any) to trading balance
            // If loss, margin covers it (margin is already deducted)
            const returnAmount = position.margin + (pnl > 0 ? pnl : 0);

            if (returnAmount > 0) {
                await db.runAsync(
                    'UPDATE trading_balances SET balance = balance + ?, updated_at = ? WHERE user_id = ?',
                    [returnAmount, now, userId]
                );
            }

            // Update position
            await db.runAsync(
                `UPDATE trading_positions 
                 SET status = 'CLOSED', 
                     pnl = ?,
                     closed_at = ? 
                 WHERE id = ?`,
                [pnl, now, positionId]
            );

            await db.runAsync('COMMIT');

            const resultMessage = pnl >= 0 
                ? `Closed with profit: $${pnl.toFixed(2)}` 
                : `Closed with loss: $${Math.abs(pnl).toFixed(2)}`;

            return {
                success: true,
                pnl,
                returnAmount,
                message: resultMessage
            };

        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Get user's open positions
    async getOpenPositions(userId) {
        const positions = await db.allAsync(
            'SELECT * FROM trading_positions WHERE user_id = ? AND status = "OPEN" ORDER BY created_at DESC',
            [userId]
        );

        // Add current prices
        return positions.map(pos => ({
            ...pos,
            currentPrice: priceOracle.getPrice(pos.asset, 'mid') || pos.entry_price
        }));
    }

    // Get position history
    async getPositionHistory(userId) {
        return await db.allAsync(
            'SELECT * FROM trading_positions WHERE user_id = ? AND status = "CLOSED" ORDER BY closed_at DESC LIMIT 50',
            [userId]
        );
    }

    // Get trading account summary
    async getAccountSummary(userId) {
        const balance = await transferService.getTradingBalance(userId);
        const positions = await this.getOpenPositions(userId);
        
        // Calculate total margin and unrealized P&L
        let totalMargin = 0;
        let unrealizedPnl = 0;

        positions.forEach(pos => {
            const contract = CONTRACTS[pos.asset];
            const currentPrice = priceOracle.getPrice(pos.asset, 'mid') || pos.entry_price;
            
            let priceDiff = currentPrice - pos.entry_price;
            if (pos.side === 'SELL') {
                priceDiff = -priceDiff;
            }
            
            const pnl = priceDiff * pos.volume * contract.size;
            
            totalMargin += pos.margin;
            unrealizedPnl += pnl;
        });

        const equity = balance + unrealizedPnl;
        const freeMargin = balance; // Balance is already free (margin is separate)
        const marginLevel = totalMargin > 0 ? (equity / totalMargin) * 100 : 0;

        return {
            balance: balance.toFixed(2),
            equity: equity.toFixed(2),
            margin: totalMargin.toFixed(2),
            freeMargin: freeMargin.toFixed(2),
            marginLevel: marginLevel.toFixed(2),
            openPositions: positions.length
        };
    }
}

module.exports = new TradingService();

const { db } = require('../config/database-supabase');
const priceOracle = require('./trading-v2/price-oracle');

class CompetitionService {
    constructor() {
        this.checkInterval = null;
    }

    start() {
        console.log('🏆 Competition Service started');
        // Check every minute for competition updates
        setInterval(() => this.updateCompetitions(), 60000);
    }

    // Create new competition
    async createCompetition(data, adminId) {
        const now = Math.floor(Date.now() / 1000);
        
        const result = await db.runAsync(
            `INSERT INTO trading_competitions 
             (name, description, prize_pool, entry_fee, start_time, end_time, 
              min_trades, max_participants, rules, created_at, created_by, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                data.name,
                data.description || '',
                data.prize_pool,
                data.entry_fee || 0,
                data.start_time,
                data.end_time,
                data.min_trades || 1,
                data.max_participants || 100,
                data.rules || '',
                now,
                adminId,
                'upcoming'
            ]
        );

        // Add prizes for top ranks
        if (data.prizes && data.prizes.length > 0) {
            for (const prize of data.prizes) {
                await db.runAsync(
                    `INSERT INTO competition_prizes (competition_id, rank, prize_amount, prize_token, description)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [result.lastID, prize.rank, prize.amount, prize.token || 'USDT', prize.description || '']
                );
            }
        }

        return result.lastID;
    }

    // Join competition
    async joinCompetition(competitionId, userId) {
        const now = Math.floor(Date.now() / 1000);

        // Check if competition exists and is upcoming
        const competition = await db.getAsync(
            'SELECT * FROM trading_competitions WHERE id = $1 AND status = $2',
            [competitionId, 'upcoming']
        );

        if (!competition) {
            throw new Error('Competition not found or already started');
        }

        // Check max participants
        if (competition.current_participants >= competition.max_participants) {
            throw new Error('Competition is full');
        }

        // Check if already joined
        const existing = await db.getAsync(
            'SELECT * FROM competition_participants WHERE competition_id = $1 AND user_id = $2',
            [competitionId, userId]
        );

        if (existing) {
            throw new Error('Already joined this competition');
        }

        // Get user's trading balance
        const balance = await db.getAsync(
            'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
            [userId]
        );

        const startingBalance = balance?.usdc_balance || 0;

        // Check entry fee
        if (competition.entry_fee > 0) {
            if (startingBalance < competition.entry_fee) {
                throw new Error('Insufficient balance for entry fee');
            }

            // Deduct entry fee
            await db.runAsync(
                'UPDATE trading_v2_balances SET usdc_balance = usdc_balance - $1 WHERE user_id = $2',
                [competition.entry_fee, userId]
            );

            // Add to prize pool
            await db.runAsync(
                'UPDATE trading_competitions SET prize_pool = prize_pool + $1 WHERE id = $2',
                [competition.entry_fee, competitionId]
            );
        }

        // Add participant
        await db.runAsync(
            `INSERT INTO competition_participants 
             (competition_id, user_id, entry_time, starting_balance, status)
             VALUES ($1, $2, $3, $4, $5)`,
            [competitionId, userId, now, startingBalance, 'active']
        );

        // Update participant count
        await db.runAsync(
            'UPDATE trading_competitions SET current_participants = current_participants + 1 WHERE id = $1',
            [competitionId]
        );

        return { joined: true };
    }

    // Track trade in competition
    async trackTrade(position) {
        if (position.status !== 'CLOSED') return;

        // Find active competitions for this user
        const competitions = await db.allAsync(`
            SELECT c.* FROM competition_participants p
            JOIN trading_competitions c ON p.competition_id = c.id
            WHERE p.user_id = $1 AND p.status = $2 AND c.status = $3
        `, [position.user_id, 'active', 'active']);

        for (const comp of competitions) {
            // Check if trade is within competition timeframe
            if (position.created_at < comp.start_time || position.created_at > comp.end_time) {
                continue;
            }

            // Calculate return percentage
            const participant = await db.getAsync(
                'SELECT * FROM competition_participants WHERE competition_id = $1 AND user_id = $2',
                [comp.id, position.user_id]
            );

            if (!participant) continue;

            const returnPercent = (position.pnl / participant.starting_balance) * 100;

            // Record trade
            await db.runAsync(
                `INSERT INTO competition_trades 
                 (competition_id, user_id, position_id, asset, side, volume, 
                  entry_price, exit_price, pnl, return_percent, entered_at, exited_at, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                    comp.id, position.user_id, position.id, position.asset, position.side,
                    position.volume, position.entry_price, position.close_price,
                    position.pnl, returnPercent, position.created_at, position.closed_at, 'closed'
                ]
            );

            // Update participant stats
            const trades = await db.allAsync(
                'SELECT * FROM competition_trades WHERE competition_id = $1 AND user_id = $2',
                [comp.id, position.user_id]
            );

            let totalPnl = 0;
            let totalVolume = 0;
            trades.forEach(t => {
                totalPnl += t.pnl || 0;
                totalVolume += (t.volume * (t.entry_price || 0));
            });

            const currentReturn = (totalPnl / participant.starting_balance) * 100;

            await db.runAsync(
                `UPDATE competition_participants 
                 SET current_pnl = $1, current_return = $2, trades_count = $3, volume = $4
                 WHERE competition_id = $5 AND user_id = $6`,
                [totalPnl, currentReturn, trades.length, totalVolume, comp.id, position.user_id]
            );
        }
    }

    // Update competition status and leaderboard
    async updateCompetitions() {
        const now = Math.floor(Date.now() / 1000);

        // Start competitions
        await db.runAsync(
            'UPDATE trading_competitions SET status = $1 WHERE start_time <= $2 AND status = $3',
            ['active', now, 'upcoming']
        );

        // End competitions
        const ended = await db.allAsync(
            'SELECT * FROM trading_competitions WHERE end_time <= $1 AND status = $2',
            [now, 'active']
        );

        for (const comp of ended) {
            await this.endCompetition(comp.id);
        }

        // Update leaderboard for active competitions
        const active = await db.allAsync(
            'SELECT * FROM trading_competitions WHERE status = $1',
            ['active']
        );

        for (const comp of active) {
            await this.updateLeaderboard(comp.id);
        }
    }

    // End competition and calculate winners
    async endCompetition(competitionId) {
        const participants = await db.allAsync(`
            SELECT * FROM competition_participants 
            WHERE competition_id = $1 AND status = $2
            ORDER BY current_return DESC
        `, [competitionId, 'active']);

        // Get prizes
        const prizes = await db.allAsync(
            'SELECT * FROM competition_prizes WHERE competition_id = $1 ORDER BY rank ASC',
            [competitionId]
        );

        // Assign ranks and prizes
        for (let i = 0; i < participants.length; i++) {
            const rank = i + 1;
            const prize = prizes.find(p => p.rank === rank);

            await db.runAsync(
                `UPDATE competition_participants 
                 SET rank = $1, prize = $2 
                 WHERE id = $3`,
                [rank, prize?.prize_amount || 0, participants[i].id]
            );
        }

        // Update competition status
        await db.runAsync(
            'UPDATE trading_competitions SET status = $1 WHERE id = $2',
            ['completed', competitionId]
        );

        // Save final leaderboard
        await db.runAsync(
            `INSERT INTO competition_leaderboard (competition_id, snapshot_time, leaderboard_data)
             VALUES ($1, $2, $3)`,
            [competitionId, Math.floor(Date.now() / 1000), JSON.stringify(participants.slice(0, 50))]
        );
    }

    // Update leaderboard
    async updateLeaderboard(competitionId) {
        const participants = await db.allAsync(`
            SELECT user_id, current_return, current_pnl, trades_count, volume
            FROM competition_participants 
            WHERE competition_id = $1 AND status = $2
            ORDER BY current_return DESC
            LIMIT 50
        `, [competitionId, 'active']);

        // Save snapshot
        await db.runAsync(
            `INSERT INTO competition_leaderboard (competition_id, snapshot_time, leaderboard_data)
             VALUES ($1, $2, $3)`,
            [competitionId, Math.floor(Date.now() / 1000), JSON.stringify(participants)]
        );
    }

    // Get competition details
    async getCompetition(competitionId) {
        const comp = await db.getAsync(
            'SELECT * FROM trading_competitions WHERE id = $1',
            [competitionId]
        );

        if (!comp) return null;

        const prizes = await db.allAsync(
            'SELECT * FROM competition_prizes WHERE competition_id = $1 ORDER BY rank ASC',
            [competitionId]
        );

        const participants = await db.allAsync(`
            SELECT p.*, u.username, u.email 
            FROM competition_participants p
            JOIN users u ON p.user_id = u.id
            WHERE p.competition_id = $1
            ORDER BY p.current_return DESC
        `, [competitionId]);

        return {
            ...comp,
            prizes,
            participants,
            participantCount: participants.length
        };
    }

    // Get user's competition stats
    async getUserCompetitionStats(userId) {
        const stats = {};

        // Competitions joined
        const competitions = await db.allAsync(`
            SELECT c.*, p.current_return, p.rank, p.prize, p.claimed
            FROM competition_participants p
            JOIN trading_competitions c ON p.competition_id = c.id
            WHERE p.user_id = $1
            ORDER BY c.end_time DESC
        `, [userId]);

        stats.competitions = competitions;

        // Best rank
        const bestRank = await db.getAsync(
            'SELECT MIN(rank) as best FROM competition_participants WHERE user_id = $1 AND rank IS NOT NULL',
            [userId]
        );
        stats.bestRank = bestRank?.best;

        // Total prizes won
        const totalPrizes = await db.getAsync(
            'SELECT SUM(prize) as total FROM competition_participants WHERE user_id = $1 AND prize > 0',
            [userId]
        );
        stats.totalPrizes = totalPrizes?.total || 0;

        // Win rate
        const wins = await db.getAsync(
            'SELECT COUNT(*) as count FROM competition_participants WHERE user_id = $1 AND rank = 1',
            [userId]
        );
        const total = await db.getAsync(
            'SELECT COUNT(*) as count FROM competition_participants WHERE user_id = $1',
            [userId]
        );
        stats.winRate = total?.count > 0 ? (wins?.count / total?.count) * 100 : 0;

        return stats;
    }

    // Add powerup
    async addPowerup(competitionId, userId, type, multiplier, duration) {
        const expiresAt = Math.floor(Date.now() / 1000) + duration;

        await db.runAsync(
            `INSERT INTO competition_powerups 
             (competition_id, user_id, powerup_type, multiplier, expires_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [competitionId, userId, type, multiplier, expiresAt, Math.floor(Date.now() / 1000)]
        );
    }

    // Get leaderboard
    async getLeaderboard(competitionId, limit = 50) {
        return await db.allAsync(`
            SELECT p.*, u.username 
            FROM competition_participants p
            JOIN users u ON p.user_id = u.id
            WHERE p.competition_id = $1 AND p.status = $2
            ORDER BY p.current_return DESC
            LIMIT $3
        `, [competitionId, 'active', limit]);
    }

    // Post chat message
    async postMessage(competitionId, userId, message) {
        await db.runAsync(
            `INSERT INTO competition_chat (competition_id, user_id, message, created_at)
             VALUES ($1, $2, $3, $4)`,
            [competitionId, userId, message, Math.floor(Date.now() / 1000)]
        );
    }

    // Get chat messages
    async getMessages(competitionId, limit = 50) {
        return await db.allAsync(`
            SELECT c.*, u.username 
            FROM competition_chat c
            JOIN users u ON c.user_id = u.id
            WHERE c.competition_id = $1
            ORDER BY c.created_at DESC
            LIMIT $2
        `, [competitionId, limit]);
    }
}

module.exports = new CompetitionService();

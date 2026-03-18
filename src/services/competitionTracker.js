const { db } = require('../config/database-supabase');
const competitionService = require('./competitionService');

class CompetitionTracker {
    constructor() {
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log('🏆 Competition tracker started');
        
        // Watch for new closed positions
        this.lastCheckedId = 0;
        setInterval(() => this.checkPositions(), 5000);
    }

    async checkPositions() {
        try {
            // Get recently closed positions
            const positions = await db.allAsync(`
                SELECT * FROM trading_v2_positions 
                WHERE status = $1 AND id > $2
                ORDER BY id ASC
            `, ['CLOSED', this.lastCheckedId]);

            for (const position of positions) {
                await competitionService.trackTrade(position);
                this.lastCheckedId = Math.max(this.lastCheckedId, position.id);
            }
        } catch (error) {
            console.error('Competition tracker error:', error);
        }
    }
}

module.exports = new CompetitionTracker();

const { db } = require('../config/database-supabase');
const emailService = require('./emailService');

class EmailObserver {
    constructor() {
        this.lastChecked = {
            deposits: 0,
            withdrawals: 0,
            logins: 0,
            twofa: 0
        };
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        console.log('📧 Email observer started - watching for events');
        
        // Check every 10 seconds
        setInterval(() => this.checkForEvents(), 10000);
    }

    async checkForEvents() {
        try {
            await this.checkNewDeposits();
            await this.checkWithdrawalUpdates();
            await this.checkLoginHistory();
            await this.check2FAChanges();
        } catch (error) {
            console.error('Email observer error:', error);
        }
    }

    async checkNewDeposits() {
        const newDeposits = await db.allAsync(`
            SELECT d.*, u.email, u.username 
            FROM deposits d
            JOIN users u ON d.user_id = u.id
            WHERE d.id > $1 AND d.status = 'confirmed'
            AND NOT EXISTS (
                SELECT 1 FROM email_logs 
                WHERE type = 'deposit' AND reference_id = d.id
            )
            ORDER BY d.id ASC
        `, [this.lastChecked.deposits]);

        for (const deposit of newDeposits) {
            await emailService.sendDepositConfirmation(
                deposit.email,
                deposit.username || 'User',
                deposit.amount,
                deposit.token,
                deposit.tx_signature || 'pending'
            );
            
            await db.runAsync(
                `INSERT INTO email_logs (type, reference_id, sent_at, recipient) 
                 VALUES ($1, $2, $3, $4)`,
                ['deposit', deposit.id, Math.floor(Date.now() / 1000), deposit.email]
            );
            
            console.log(`💰 Deposit email sent to ${deposit.email}`);
            this.lastChecked.deposits = Math.max(this.lastChecked.deposits, deposit.id);
        }
    }

    async checkWithdrawalUpdates() {
        const updatedWithdrawals = await db.allAsync(`
            SELECT w.*, u.email, u.username 
            FROM withdrawals w
            JOIN users u ON w.user_id = u.id
            WHERE (w.status = 'completed' OR w.status = 'declined')
            AND w.processed_at IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM email_logs 
                WHERE type = 'withdrawal' AND reference_id = w.id
            )
            ORDER BY w.id ASC
        `);

        for (const w of updatedWithdrawals) {
            if (w.status === 'completed') {
                await emailService.sendWithdrawalApproved(
                    w.email,
                    w.username || 'User',
                    w.amount,
                    w.token,
                    w.tx_signature
                );
            } else if (w.status === 'declined') {
                await emailService.sendWithdrawalDeclined(
                    w.email,
                    w.username || 'User',
                    w.amount,
                    w.token,
                    'Declined by admin'
                );
            }
            
            await db.runAsync(
                `INSERT INTO email_logs (type, reference_id, sent_at, recipient) 
                 VALUES ($1, $2, $3, $4)`,
                ['withdrawal', w.id, Math.floor(Date.now() / 1000), w.email]
            );
            
            console.log(`📤 Withdrawal email sent to ${w.email}`);
        }
    }

    async checkLoginHistory() {
        const newLogins = await db.allAsync(`
            SELECT l.*, u.email, u.username 
            FROM login_history l
            JOIN users u ON l.user_id = u.id
            WHERE l.id > $1 
            AND NOT EXISTS (
                SELECT 1 FROM email_logs 
                WHERE type = 'login' AND reference_id = l.id
            )
            ORDER BY l.id ASC
        `, [this.lastChecked.logins]);

        for (const login of newLogins) {
            await emailService.sendLoginAlert(
                login.email,
                login.username || 'User',
                login.ip || 'Unknown IP',
                login.device || 'Unknown device',
                'Unknown'
            );
            
            await db.runAsync(
                `INSERT INTO email_logs (type, reference_id, sent_at, recipient) 
                 VALUES ($1, $2, $3, $4)`,
                ['login', login.id, Math.floor(Date.now() / 1000), login.email]
            );
            
            console.log(`🔐 Login alert sent to ${login.email}`);
            this.lastChecked.logins = Math.max(this.lastChecked.logins, login.id);
        }
    }

    async check2FAChanges() {
        const twofaChanges = await db.allAsync(`
            SELECT u.id, u.email, u.username, u.twofa_enabled 
            FROM users u
            WHERE u.twofa_enabled IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM email_logs 
                WHERE type = '2fa' AND reference_id = u.id
            )
            ORDER BY u.id ASC
        `);

        for (const user of twofaChanges) {
            if (user.twofa_enabled === true) {
                await emailService.send2FAEnabled(
                    user.email,
                    user.username || 'User',
                    'Unknown device'
                );
            } else {
                await emailService.send2FADisabled(
                    user.email,
                    user.username || 'User',
                    'Unknown device'
                );
            }
            
            await db.runAsync(
                `INSERT INTO email_logs (type, reference_id, sent_at, recipient) 
                 VALUES ($1, $2, $3, $4)`,
                ['2fa', user.id, Math.floor(Date.now() / 1000), user.email]
            );
            
            console.log(`🔐 2FA email sent to ${user.email}`);
        }
    }
}

module.exports = new EmailObserver();

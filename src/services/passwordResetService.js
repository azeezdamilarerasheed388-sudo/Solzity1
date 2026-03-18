const crypto = require('crypto');
const { db } = require('../config/database-supabase');
const emailService = require('./emailService');

class PasswordResetService {
    constructor() {
        this.tokenExpiry = 3600; // 1 hour in seconds
    }

    // Generate a secure random token
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Create reset token for user
    async createResetToken(userId, email) {
        const token = this.generateToken();
        const expiresAt = Math.floor(Date.now() / 1000) + this.tokenExpiry;
        const now = Math.floor(Date.now() / 1000);
        
        // Invalidate any existing tokens for this user
        await db.runAsync(
            `UPDATE password_resets SET used = true 
             WHERE user_id = $1 AND used = false`,
            [userId]
        );
        
        // Create new token
        await db.runAsync(
            `INSERT INTO password_resets (user_id, token, expires_at, used, created_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, token, expiresAt, false, now]
        );
        
        return token;
    }

    // Send password reset email - UPDATED for Brevo
    async sendResetEmail(email, username, resetLink) {
        // Use Brevo's email service instead of direct transporter
        await emailService.sendPasswordResetEmail(email, username, resetLink);
    }

    // Send password reset success email - UPDATED for Brevo
    async sendResetSuccessEmail(email, username, ip, device) {
        // Use Brevo's email service
        await emailService.sendPasswordResetSuccessEmail(email, username, ip, device);
    }

    // Validate reset token
    async validateToken(token) {
        const reset = await db.getAsync(
            `SELECT pr.*, u.email, u.username 
             FROM password_resets pr
             JOIN users u ON pr.user_id = u.id
             WHERE pr.token = $1 AND pr.used = false AND pr.expires_at > $2`,
            [token, Math.floor(Date.now() / 1000)]
        );
        
        return reset;
    }

    // Reset password
    async resetPassword(token, newPassword, ip, userAgent) {
        const reset = await this.validateToken(token);
        
        if (!reset) {
            throw new Error('Invalid or expired reset token');
        }
        
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        await db.runAsync('BEGIN TRANSACTION');
        
        try {
            // Update user's password
            await db.runAsync(
                'UPDATE users SET password_hash = $1 WHERE id = $2',
                [hashedPassword, reset.user_id]
            );
            
            // Mark token as used
            await db.runAsync(
                'UPDATE password_resets SET used = true WHERE id = $1',
                [reset.id]
            );
            
            // Log the reset
            await db.runAsync(
                `INSERT INTO password_reset_history (user_id, reset_by_ip, user_agent, created_at)
                 VALUES ($1, $2, $3, $4)`,
                [reset.user_id, ip, userAgent, Math.floor(Date.now() / 1000)]
            );
            
            await db.runAsync('COMMIT');
            
            // Send success email
            await this.sendResetSuccessEmail(reset.email, reset.username, ip, userAgent);
            
            return true;
            
        } catch (error) {
            await db.runAsync('ROLLBACK');
            throw error;
        }
    }

    // Get reset history for a user (admin)
    async getResetHistory(userId) {
        return await db.allAsync(
            `SELECT * FROM password_reset_history 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 10`,
            [userId]
        );
    }
}

module.exports = new PasswordResetService();

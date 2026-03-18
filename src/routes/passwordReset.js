const express = require('express');
const router = express.Router();
const { db } = require('../config/database-supabase');
const passwordResetService = require('../services/passwordResetService');
const passwordValidator = require('../utils/passwordValidator');

// Request password reset
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email is required' 
            });
        }
        
        console.log('🔍 Looking up user:', email);
        
        // Find user
        const user = await db.getAsync(
            'SELECT id, username FROM users WHERE email = ?',
            [email.toLowerCase()]
        );
        
        console.log('User found:', user ? 'Yes' : 'No');
        
        // Always return success (don't reveal if email exists)
        if (!user) {
            return res.json({ 
                success: true, 
                message: 'If your email exists, you will receive a reset link' 
            });
        }
        
        // Create reset token
        const token = await passwordResetService.createResetToken(user.id, email);
        console.log('✅ Reset token created for user:', user.id);
        
        // Create reset link
        const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;
        const resetLink = `${baseUrl}/reset-password?token=${token}`;
        
        // Send email
        await passwordResetService.sendResetEmail(email, user.username, resetLink);
        console.log('📧 Reset email sent to:', email);
        
        res.json({ 
            success: true, 
            message: 'If your email exists, you will receive a reset link' 
        });
        
    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to process request' 
        });
    }
});

// Verify reset token
router.post('/verify-reset-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        const reset = await passwordResetService.validateToken(token);
        
        if (!reset) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid or expired reset token' 
            });
        }
        
        res.json({ 
            success: true, 
            message: 'Token is valid',
            email: reset.email 
        });
        
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to verify token' 
        });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        
        const passwordCheck = passwordValidator(password);
        if (!passwordCheck.isValid) {
            return res.status(400).json({ 
                success: false, 
                errors: passwordCheck.errors 
            });
        }
        
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        
        await passwordResetService.resetPassword(token, password, ip, userAgent);
        
        res.json({ 
            success: true, 
            message: 'Password reset successfully! You can now login with your new password.' 
        });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(400).json({ 
            success: false, 
            error: error.message || 'Failed to reset password' 
        });
    }
});

module.exports = router;

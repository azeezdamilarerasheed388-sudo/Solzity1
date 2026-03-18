const User = require('../models/User');
const walletService = require('../services/walletService');
const emailService = require('../services/emailService');
const verificationService = require('../services/verificationService');
const passwordValidator = require('../utils/passwordValidator');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database-supabase');

class EnhancedAuthController {
    async register(req, res) {
        try {
            const { email, username, password } = req.body;
            
            const passwordCheck = passwordValidator(password);
            if (!passwordCheck.isValid) {
                return res.status(400).json({ 
                    success: false, 
                    errors: passwordCheck.errors 
                });
            }

            const existing = await User.findByEmail(email);
            if (existing) {
                return res.status(400).json({ error: 'Email already exists' });
            }

            const user = await User.create(email, username, password);
            
            const wallet = await walletService.createUserWallet(user.id, username);
        
            // Refresh deposit scanner to detect new user's wallet
            const depositScanner = require('../services/depositScanner');
            await depositScanner.refreshAfterNewUser();
            
            const verificationCode = await verificationService.createVerification(user.id, email);
            
            await emailService.sendVerificationEmail(email, username, verificationCode);
            
            const token = jwt.sign(
                { id: user.id, email: user.email, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                success: true,
                message: 'Registration successful! Please check your email for verification code.',
                user: { 
                    id: user.id, 
                    email: user.email, 
                    username: user.username,
                    verified: false
                },
                wallets: wallet.addresses,
                token
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async verifyEmail(req, res) {
        try {
            const { code } = req.body;
            const userId = req.user.id;
            
            const verified = await verificationService.verifyCode(userId, code);
            
            if (!verified) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Invalid or expired verification code' 
                });
            }
            
            const user = await User.findById(userId);
            await emailService.sendWelcomeEmail(user.email, user.username);
            
            res.json({
                success: true,
                message: 'Email verified successfully!'
            });
        } catch (error) {
            console.error('Verification error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async resendVerification(req, res) {
        try {
            const userId = req.user.id;
            
            const user = await User.findById(userId);
            
            if (await verificationService.isVerified(userId)) {
                return res.status(400).json({ error: 'Email already verified' });
            }
            
            const verificationCode = await verificationService.createVerification(userId, user.email);
            await emailService.sendVerificationEmail(user.email, user.username, verificationCode);
            
            res.json({
                success: true,
                message: 'Verification code resent!'
            });
        } catch (error) {
            console.error('Resend error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;
            
            const user = await User.findByEmail(email);
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const valid = await User.verifyPassword(user, password);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const ip = req.ip || req.connection.remoteAddress;
            const device = req.headers['user-agent'];
            
            emailService.sendLoginAlert(user.email, user.username, ip, 'Unknown', device).catch(console.error);
            
            await db.runAsync(
                `INSERT INTO login_history (user_id, ip, device, created_at)
                 VALUES (?, ?, ?, ?)`,
                [user.id, ip, device, Math.floor(Date.now() / 1000)]
            );

            const wallet = await walletService.getUserWallet(user.id);
            
            const token = jwt.sign(
                { id: user.id, email: user.email, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                success: true,
                user: { 
                    id: user.id, 
                    email: user.email, 
                    username: user.username,
                    verified: user.email_verified || false
                },
                wallets: wallet ? {
                    sol: wallet.solana_address,
                    usdc: wallet.usdc_address,
                    usdt: wallet.usdt_address
                } : null,
                balances: {
                    sol: wallet?.sol_balance || 0,
                    usdc: wallet?.usdc_balance || 0,
                    usdt: wallet?.usdt_balance || 0
                },
                token
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new EnhancedAuthController();

const User = require('../models/User');
const walletService = require('../services/walletService');
const jwt = require('jsonwebtoken');

class AuthController {
    async register(req, res) {
        try {
            const { email, username, password } = req.body;
            
            const existing = await User.findByEmail(email);
            if (existing) {
                return res.status(400).json({ error: 'Email already exists' });
            }

            const user = await User.create(email, username, password);
            
            // Create wallet for user
            const wallet = await walletService.createUserWallet(user.id, username);
            
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
                    is_admin: 0
                },
                wallets: wallet.addresses,
                depositAddress: wallet.addresses.sol, // Add this for easy access
                token
            });
        } catch (error) {
            console.error('Registration error:', error);
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
                    is_admin: user.is_admin || 0
                },
                wallets: wallet ? {
                    sol: wallet.solana_address,
                    usdc: wallet.usdc_address,
                    usdt: wallet.usdt_address
                } : null,
                depositAddress: wallet?.solana_address, // Add this for easy access
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

    async getProfile(req, res) {
        try {
            const user = await User.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const wallet = await walletService.getUserWallet(user.id);
            
            // Ensure we return the wallet data properly
            const wallets = wallet ? {
                sol: wallet.solana_address,
                sol_address: wallet.solana_address, // Add alternative format
                usdc: wallet.usdc_address,
                usdt: wallet.usdt_address
            } : null;
            
            const balances = {
                sol_balance: wallet?.sol_balance || 0,
                usdc_balance: wallet?.usdc_balance || 0,
                usdt_balance: wallet?.usdt_balance || 0
            };
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    is_admin: user.is_admin || 0,
                    created_at: user.created_at
                },
                wallets,
                depositAddress: wallet?.solana_address, // Add this for easy access
                balances
            });
        } catch (error) {
            console.error('Profile error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new AuthController();

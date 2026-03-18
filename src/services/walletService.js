const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const hdWallet = require('./hdWalletService');
const { db } = require('../config/database-supabase');

class WalletService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
    }

    encryptPrivateKey(privateKey, userId) {
        const iv = crypto.randomBytes(16);
        const salt = crypto.randomBytes(64);
        const key = crypto.scryptSync(userId.toString(), salt, 32);
        const cipher = crypto.createCipheriv(this.algorithm, key, iv);
        
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            salt: salt.toString('hex')
        };
    }

    decryptPrivateKey(encryptedData, userId) {
        const { encrypted, iv, authTag, salt } = encryptedData;
        const key = crypto.scryptSync(userId.toString(), Buffer.from(salt, 'hex'), 32);
        const decipher = crypto.createDecipheriv(this.algorithm, key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    async createUserWallet(userId, username) {
        try {
            console.log(`\n🔐 Creating wallet for ${username} (ID: ${userId})...`);
            
            const wallet = await hdWallet.generateUserWallet(userId);
            
            const encryptedKey = this.encryptPrivateKey(wallet.secretKey, userId);
            
            const walletId = uuidv4();
            const now = Math.floor(Date.now() / 1000);
            
            await db.runAsync(
                `INSERT INTO wallets (
                    id, user_id, solana_address, derivation_path, 
                    encrypted_private_key, sol_balance, usdc_balance, usdt_balance, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    walletId, userId,
                    wallet.solAddress,
                    wallet.derivationPath,
                    JSON.stringify(encryptedKey),
                    0, 0, 0, now
                ]
            );
            
            console.log(`   ✅ SOL Address: ${wallet.solAddress}`);
            
            return {
                walletId,
                depositAddress: wallet.solAddress,
                addresses: {
                    sol: wallet.solAddress,
                    usdc: wallet.usdcAta,
                    usdt: wallet.usdtAta
                }
            };
            
        } catch (error) {
            console.error('❌ Error creating user wallet:', error.message);
            throw error;
        }
    }

    async getUserWallet(userId) {
        return db.getAsync('SELECT * FROM wallets WHERE user_id = ?', [userId]);
    }

    async getUserBalances(userId) {
        const wallet = await db.getAsync(
            'SELECT sol_balance, usdc_balance, usdt_balance FROM wallets WHERE user_id = ?',
            [userId]
        );
        return wallet || { sol_balance: 0, usdc_balance: 0, usdt_balance: 0 };
    }

    async updateLastScannedSignature(userId, signature) {
        await db.runAsync(
            'UPDATE wallets SET last_scanned_signature = ?, updated_at = ? WHERE user_id = ?',
            [signature, Math.floor(Date.now() / 1000), userId]
        );
    }
}

module.exports = new WalletService();

const { 
    Connection, 
    PublicKey, 
    Keypair, 
    Transaction, 
    SystemProgram, 
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { 
    getAssociatedTokenAddress, 
    createTransferInstruction, 
    createAssociatedTokenAccountInstruction,
    getAccount,
    TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const bs58 = require('bs58');
const { db } = require('../config/database-supabase');
const walletService = require('./walletService');

class MasterWalletService {
    constructor() {
        this.connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
        
        try {
            this.masterWallet = this.loadMasterWallet();
            console.log(`✅ Master wallet loaded: ${this.masterWallet.publicKey.toBase58()}`);
        } catch (error) {
            console.error('❌ Failed to load master wallet:', error.message);
            this.masterWallet = null;
        }
        
        this.MINTS = {
            USDC: new PublicKey(process.env.USDC_MINT || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'),
            USDT: new PublicKey(process.env.USDT_MINT || 'Es9vMFrzaDCmFsc1Khm6Jf3N6St6H1VxmKkFZ7W8XQZ')
        };
        
        console.log(`🏦 Master Wallet Service Ready`);
    }

    loadMasterWallet() {
        try {
            const mnemonicPath = process.env.MASTER_MNEMONIC_PATH || './keys/master-mnemonic.txt';
            const fullPath = path.resolve(mnemonicPath);
            
            console.log(`📁 Looking for master mnemonic at: ${fullPath}`);
            
            if (!fs.existsSync(fullPath)) {
                throw new Error(`Master mnemonic file not found at ${fullPath}`);
            }
            
            const mnemonic = fs.readFileSync(fullPath, 'utf8').trim();
            const seed = bip39.mnemonicToSeedSync(mnemonic);
            const derivationPath = "m/44'/501'/0'/0'";
            const { key } = derivePath(derivationPath, seed.toString('hex'));
            const keypair = Keypair.fromSeed(key.slice(0, 32));
            
            return keypair;
        } catch (error) {
            console.error('❌ Failed to load master wallet:', error.message);
            throw error;
        }
    }

    // Get master wallet on-chain balances
    async getMasterBalances() {
        try {
            if (!this.masterWallet) {
                return {
                    sol: 0,
                    usdc: 0,
                    usdt: 0,
                    address: 'Master wallet not loaded',
                    usdcAta: '',
                    usdtAta: ''
                };
            }

            // Get SOL balance
            const solBalance = await this.connection.getBalance(this.masterWallet.publicKey) / LAMPORTS_PER_SOL;
            
            // Get USDC balance
            const usdcAta = await getAssociatedTokenAddress(this.MINTS.USDC, this.masterWallet.publicKey);
            let usdcBalance = 0;
            try {
                const usdcAccount = await this.connection.getTokenAccountBalance(usdcAta);
                usdcBalance = usdcAccount.value.uiAmount;
            } catch (e) {
                console.log('USDC account may not exist yet');
            }

            // Get USDT balance
            const usdtAta = await getAssociatedTokenAddress(this.MINTS.USDT, this.masterWallet.publicKey);
            let usdtBalance = 0;
            try {
                const usdtAccount = await this.connection.getTokenAccountBalance(usdtAta);
                usdtBalance = usdtAccount.value.uiAmount;
            } catch (e) {
                console.log('USDT account may not exist yet');
            }

            const result = {
                sol: solBalance,
                usdc: usdcBalance,
                usdt: usdtBalance,
                address: this.masterWallet.publicKey.toBase58(),
                usdcAta: usdcAta.toBase58(),
                usdtAta: usdtAta.toBase58()
            };
            
            console.log('✅ Master balances retrieved:', result);
            return result;
            
        } catch (error) {
            console.error('Error getting master balances:', error);
            return {
                sol: 0,
                usdc: 0,
                usdt: 0,
                address: 'Error loading',
                usdcAta: '',
                usdtAta: ''
            };
        }
    }

    // Get user on-chain balances
    async getUserOnChainBalance(userId) {
        try {
            const userWallet = await db.getAsync(
                'SELECT solana_address, encrypted_private_key FROM wallets WHERE user_id = ?',
                [userId]
            );

            if (!userWallet) {
                return {
                    userId: parseInt(userId),
                    address: 'Not found',
                    sol: 0,
                    usdc: 0,
                    usdt: 0,
                    hasWallet: false
                };
            }

            const userPubkey = new PublicKey(userWallet.solana_address);

            // Get SOL balance
            const solBalance = await this.connection.getBalance(userPubkey) / LAMPORTS_PER_SOL;

            // Get USDC balance
            const usdcAta = await getAssociatedTokenAddress(this.MINTS.USDC, userPubkey);
            let usdcBalance = 0;
            try {
                const usdcAccount = await this.connection.getTokenAccountBalance(usdcAta);
                usdcBalance = usdcAccount.value.uiAmount;
            } catch (e) {}

            // Get USDT balance
            const usdtAta = await getAssociatedTokenAddress(this.MINTS.USDT, userPubkey);
            let usdtBalance = 0;
            try {
                const usdtAccount = await this.connection.getTokenAccountBalance(usdtAta);
                usdtBalance = usdtAccount.value.uiAmount;
            } catch (e) {}

            return {
                userId: parseInt(userId),
                address: userWallet.solana_address,
                sol: solBalance,
                usdc: usdcBalance,
                usdt: usdtBalance,
                usdcAta: usdcAta.toBase58(),
                usdtAta: usdtAta.toBase58(),
                encryptedPrivateKey: userWallet.encrypted_private_key,
                hasWallet: true
            };
        } catch (error) {
            console.error(`Error getting user ${userId} on-chain balance:`, error);
            return {
                userId: parseInt(userId),
                address: 'Error',
                sol: 0,
                usdc: 0,
                usdt: 0,
                hasWallet: false
            };
        }
    }

    // Get all users on-chain balances
    async getAllUsersOnChainBalances() {
        try {
            const users = await db.allAsync('SELECT user_id FROM wallets');
            const balances = [];
            
            for (const user of users) {
                const balance = await this.getUserOnChainBalance(user.user_id);
                balances.push(balance);
            }
            
            return balances;
        } catch (error) {
            console.error('Error getting all users balances:', error);
            return [];
        }
    }

    // SWEEP SOL: User pays fees
    async sweepSOL(userId) {
        try {
            console.log(`💰 Starting sweep of SOL from user ${userId}...`);

            // Get user's wallet info
            const userWallet = await db.getAsync(
                'SELECT solana_address, encrypted_private_key FROM wallets WHERE user_id = ?',
                [userId]
            );

            if (!userWallet) {
                throw new Error('User wallet not found');
            }

            // Decrypt private key
            const encryptedData = JSON.parse(userWallet.encrypted_private_key);
            const privateKey = walletService.decryptPrivateKey(encryptedData, userId);
            const userKeypair = Keypair.fromSecretKey(bs58.decode(privateKey));

            // Check SOL balance
            const balance = await this.connection.getBalance(userKeypair.publicKey);
            
            if (balance <= 5000) {
                throw new Error('Insufficient SOL balance to sweep (need at least 0.000005 SOL for fees)');
            }

            const sweepAmount = (balance - 5000) / LAMPORTS_PER_SOL;
            const sweepLamports = balance - 5000;

            console.log(`   Sweeping: ${sweepAmount} SOL to master wallet (user pays fee)`);

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: userKeypair.publicKey,
                    toPubkey: this.masterWallet.publicKey,
                    lamports: sweepLamports,
                })
            );

            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = userKeypair.publicKey;

            const txHash = await sendAndConfirmTransaction(this.connection, transaction, [userKeypair]);

            // Record sweep
            await db.runAsync(
                `INSERT INTO master_sweeps (user_id, token, amount, tx_signature, created_at)
                 VALUES (?, 'SOL', ?, ?, ?) RETURNING id`,
                [userId, sweepAmount, txHash, Math.floor(Date.now() / 1000)]
            );

            return {
                success: true,
                userId,
                token: 'SOL',
                amount: sweepAmount,
                txHash,
                message: `Successfully swept ${sweepAmount} SOL from user ${userId}`
            };

        } catch (error) {
            console.error('❌ SOL sweep failed:', error);
            throw error;
        }
    }

    // SWEEP Token (USDC/USDT): Master pays fees
    async sweepToken(userId, tokenSymbol) {
        try {
            console.log(`💰 Starting sweep of ${tokenSymbol} from user ${userId}...`);

            // Get user's wallet info
            const userWallet = await db.getAsync(
                'SELECT solana_address, encrypted_private_key FROM wallets WHERE user_id = ?',
                [userId]
            );

            if (!userWallet) {
                throw new Error('User wallet not found');
            }

            // Decrypt private key
            const encryptedData = JSON.parse(userWallet.encrypted_private_key);
            const privateKey = walletService.decryptPrivateKey(encryptedData, userId);
            const userKeypair = Keypair.fromSecretKey(bs58.decode(privateKey));

            const mint = this.MINTS[tokenSymbol];
            const userAta = await getAssociatedTokenAddress(mint, userKeypair.publicKey);
            
            // Check token balance
            let tokenBalance = 0;
            try {
                const account = await this.connection.getTokenAccountBalance(userAta);
                tokenBalance = account.value.uiAmount;
            } catch (e) {
                throw new Error(`No ${tokenSymbol} token account found for user`);
            }

            if (tokenBalance <= 0) {
                throw new Error(`No ${tokenSymbol} tokens to sweep`);
            }

            console.log(`   Sweeping: ${tokenBalance} ${tokenSymbol} to master wallet`);
            console.log(`   💡 Master wallet will pay the transaction fee`);

            const masterAta = await getAssociatedTokenAddress(mint, this.masterWallet.publicKey);
            
            // Make sure master has token account
            try {
                await getAccount(this.connection, masterAta);
            } catch (e) {
                console.log("📝 Creating master token account...");
                const createTx = new Transaction().add(
                    createAssociatedTokenAccountInstruction(
                        this.masterWallet.publicKey,
                        masterAta,
                        this.masterWallet.publicKey,
                        mint
                    )
                );
                
                const { blockhash } = await this.connection.getLatestBlockhash();
                createTx.recentBlockhash = blockhash;
                createTx.feePayer = this.masterWallet.publicKey;
                
                await sendAndConfirmTransaction(this.connection, createTx, [this.masterWallet]);
            }

            const decimals = 6;
            const adjustedAmount = Math.floor(tokenBalance * Math.pow(10, decimals));

            // Create transaction with MASTER as fee payer
            const transaction = new Transaction().add(
                createTransferInstruction(
                    userAta,
                    masterAta,
                    userKeypair.publicKey,
                    adjustedAmount,
                    {},
                    TOKEN_PROGRAM_ID
                )
            );

            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            
            // Set master wallet as fee payer
            transaction.feePayer = this.masterWallet.publicKey;

            // Both parties must sign
            transaction.partialSign(userKeypair);
            transaction.partialSign(this.masterWallet);

            // Send transaction
            const txHash = await this.connection.sendRawTransaction(transaction.serialize());
            await this.connection.confirmTransaction(txHash);

            // Record sweep
            await db.runAsync(
                `INSERT INTO master_sweeps (user_id, token, amount, tx_signature, created_at)
                 VALUES (?, ?, ?, ?, ?) RETURNING id`,
                [userId, tokenSymbol, tokenBalance, txHash, Math.floor(Date.now() / 1000)]
            );

            return {
                success: true,
                userId,
                token: tokenSymbol,
                amount: tokenBalance,
                txHash,
                message: `Successfully swept ${tokenBalance} ${tokenSymbol} from user ${userId}`
            };

        } catch (error) {
            console.error(`❌ ${tokenSymbol} sweep failed:`, error);
            throw error;
        }
    }

    // Sweep all tokens from a user
    async sweepAllFromUser(userId) {
        const results = {
            userId,
            SOL: null,
            USDC: null,
            USDT: null,
            errors: []
        };

        // Sweep SOL
        try {
            results.SOL = await this.sweepSOL(userId);
        } catch (error) {
            results.errors.push(`SOL: ${error.message}`);
        }

        // Sweep USDC
        try {
            results.USDC = await this.sweepToken(userId, 'USDC');
        } catch (error) {
            results.errors.push(`USDC: ${error.message}`);
        }

        // Sweep USDT
        try {
            results.USDT = await this.sweepToken(userId, 'USDT');
        } catch (error) {
            results.errors.push(`USDT: ${error.message}`);
        }

        return results;
    }

    // Sweep all from all users
    async sweepAllUsers() {
        const users = await db.allAsync('SELECT user_id FROM wallets');
        const results = [];

        for (const user of users) {
            try {
                const result = await this.sweepAllFromUser(user.user_id);
                results.push(result);
            } catch (error) {
                console.error(`Error sweeping user ${user.user_id}:`, error);
            }
        }

        return results;
    }

    // WITHDRAW: Move funds from master wallet to external cold wallet
    async withdrawToColdWallet(token, amount, destinationAddress) {
        try {
            console.log(`💰 Withdrawing ${amount} ${token} to cold wallet...`);

            const destPubkey = new PublicKey(destinationAddress);
            
            let txHash;
            if (token === 'SOL') {
                const balance = await this.connection.getBalance(this.masterWallet.publicKey);
                const withdrawAmount = amount * LAMPORTS_PER_SOL;
                
                if (balance < withdrawAmount + 5000) {
                    throw new Error(`Insufficient SOL balance. Have: ${balance / LAMPORTS_PER_SOL} SOL, Need: ${amount + 0.000005} SOL`);
                }

                const transaction = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: this.masterWallet.publicKey,
                        toPubkey: destPubkey,
                        lamports: withdrawAmount,
                    })
                );

                txHash = await sendAndConfirmTransaction(this.connection, transaction, [this.masterWallet]);

            } else {
                const mint = this.MINTS[token];
                const fromAta = await getAssociatedTokenAddress(mint, this.masterWallet.publicKey);
                const toAta = await getAssociatedTokenAddress(mint, destPubkey);

                try {
                    await getAccount(this.connection, toAta);
                } catch (e) {
                    console.log("📝 Creating destination token account...");
                    const createTx = new Transaction().add(
                        createAssociatedTokenAccountInstruction(
                            this.masterWallet.publicKey,
                            toAta,
                            destPubkey,
                            mint
                        )
                    );
                    await sendAndConfirmTransaction(this.connection, createTx, [this.masterWallet]);
                }

                const decimals = 6;
                const adjustedAmount = Math.floor(amount * Math.pow(10, decimals));

                const transaction = new Transaction().add(
                    createTransferInstruction(
                        fromAta,
                        toAta,
                        this.masterWallet.publicKey,
                        adjustedAmount,
                        {},
                        TOKEN_PROGRAM_ID
                    )
                );

                txHash = await sendAndConfirmTransaction(this.connection, transaction, [this.masterWallet]);
            }

            await db.runAsync(
                `INSERT INTO master_withdrawals (token, amount, to_address, tx_signature, created_at)
                 VALUES (?, ?, ?, ?, ?) RETURNING id`,
                [token, amount, destinationAddress, txHash, Math.floor(Date.now() / 1000)]
            );

            console.log(`✅ Withdrawal complete: ${amount} ${token} to ${destinationAddress}`);
            console.log(`   Tx: ${txHash}`);

            return {
                success: true,
                token,
                amount,
                destination: destinationAddress,
                txHash
            };

        } catch (error) {
            console.error('❌ Cold wallet withdrawal failed:', error);
            throw error;
        }
    }

    async reconcileBalances() {
        return [];
    }
}

module.exports = new MasterWalletService();

const { Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const fs = require('fs');
const path = require('path');
const bs58 = require('bs58');

// Token mint addresses
const MINTS = {
    USDC: new PublicKey(process.env.USDC_MINT || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'),
    USDT: new PublicKey(process.env.USDT_MINT || 'Es9vMFrzaDCmFsc1Khm6Jf3N6St6H1VxmKkFZ7W8XQZ')
};

class HDWalletService {
    constructor(mnemonicPath = process.env.MASTER_MNEMONIC_PATH || './keys/master-mnemonic.txt') {
        const fullPath = path.resolve(mnemonicPath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Master mnemonic not found at ${fullPath}. Run yarn init-master first`);
        }
        this.mnemonic = fs.readFileSync(fullPath, 'utf8').trim();
        console.log('🔐 HD Wallet Service initialized');
    }

    async generateUserWallet(userId) {
        // 1. Root Seed from Mnemonic
        const seed = await bip39.mnemonicToSeed(this.mnemonic);

        // 2. Derive SOL Keypair (this is the ONLY address the user sees)
        const path = `m/44'/501'/${userId}'/0'`;
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        const userKeypair = Keypair.fromSeed(derivedSeed);
        const solAddress = userKeypair.publicKey;

        // 3. Derive Token ATAs (for internal scanning only - NOT shown to user)
        const usdcAta = await getAssociatedTokenAddress(
            MINTS.USDC, solAddress
        );
        const usdtAta = await getAssociatedTokenAddress(
            MINTS.USDT, solAddress
        );

        return {
            userId,
            derivationPath: path,
            // User only sees this:
            solAddress: solAddress.toBase58(),
            // Internal use only (for scanning):
            usdcAta: usdcAta.toBase58(),
            usdtAta: usdtAta.toBase58(),
            keypair: userKeypair,
            secretKey: bs58.encode(userKeypair.secretKey)
        };
    }
}

module.exports = new HDWalletService();

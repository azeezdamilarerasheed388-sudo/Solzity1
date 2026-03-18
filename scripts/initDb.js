const { db } = require('../src/config/database');
const path = require('path');

async function initDatabase() {
    console.log('🗃️ Initializing Database...');
    
    try {
        // Users table
        await db.runAsync(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);
        console.log('✅ Users table created');

        // Wallets table
        await db.runAsync(`
            CREATE TABLE IF NOT EXISTS wallets (
                id TEXT PRIMARY KEY,
                user_id INTEGER UNIQUE NOT NULL,
                solana_address TEXT UNIQUE NOT NULL,
                derivation_path TEXT NOT NULL,
                encrypted_private_key TEXT NOT NULL,
                sol_balance REAL DEFAULT 0,
                usdc_balance REAL DEFAULT 0,
                usdt_balance REAL DEFAULT 0,
                last_scanned_signature TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Wallets table created');

        // Deposits table
        await db.runAsync(`
            CREATE TABLE IF NOT EXISTS deposits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL,
                amount REAL NOT NULL,
                to_address TEXT NOT NULL,
                from_address TEXT,
                tx_signature TEXT UNIQUE NOT NULL,
                slot INTEGER,
                block_time INTEGER,
                status TEXT DEFAULT 'confirmed',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Deposits table created');

        // Indexes
        await db.runAsync('CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id)');
        await db.runAsync('CREATE INDEX IF NOT EXISTS idx_deposits_signature ON deposits(tx_signature)');
        await db.runAsync('CREATE INDEX IF NOT EXISTS idx_wallets_solana ON wallets(solana_address)');

        // Get the actual database path
        const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'cex-platform.db');
        
        console.log('\n✅ Database initialized successfully');
        console.log(`📁 Database location: ${dbPath}`);
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
    } finally {
        db.close();
    }
}

initDatabase();

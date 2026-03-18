const { Pool } = require('pg');
require('dotenv').config();

let poolInstance = null;

async function getDb() {
    if (poolInstance) return poolInstance;
    
    console.log('🔌 Connecting to Supabase...');
    
    const pool = new Pool({
        host: 'aws-1-eu-west-1.pooler.supabase.com',
        port: 5432,
        database: 'postgres',
        user: 'postgres.dwnrpsiciwrwsqcmnowb',
        password: 'dammywise123',
        ssl: {
            rejectUnauthorized: false,
        },
        family: 4,
        connectionTimeoutMillis: 10000,
        max: 20,
        idleTimeoutMillis: 30000,
    });

    try {
        const client = await pool.connect();
        console.log('✅ Connected to Supabase successfully!');
        client.release();
    } catch (err) {
        console.error('❌ Failed to connect to Supabase:', err.message);
        throw err;
    }

    // FIXED: Correct parameter replacement
    pool.runAsync = async function(sql, params = []) {
        // Convert ? to $1, $2, $3 etc. CORRECTLY
        let query = sql;
        if (params.length > 0) {
            // Replace each ? with $1, $2, $3 in order
            let paramIndex = 1;
            query = sql.replace(/\?/g, () => `$${paramIndex++}`);
        }
        
        try {
            const result = await this.query(query, params);
            return { 
                lastID: result.rows[0]?.id || null,
                changes: result.rowCount 
            };
        } catch (err) {
            console.error('❌ Query error:', err.message);
            console.error('SQL:', query);
            console.error('Params:', params);
            throw err;
        }
    };

    // FIXED: Same fix for getAsync
    pool.getAsync = async function(sql, params = []) {
        let query = sql;
        if (params.length > 0) {
            let paramIndex = 1;
            query = sql.replace(/\?/g, () => `$${paramIndex++}`);
        }
        
        try {
            const result = await this.query(query, params);
            return result.rows[0] || null;
        } catch (err) {
            console.error('❌ Query error:', err.message);
            console.error('SQL:', query);
            console.error('Params:', params);
            throw err;
        }
    };

    // FIXED: Same fix for allAsync
    pool.allAsync = async function(sql, params = []) {
        let query = sql;
        if (params.length > 0) {
            let paramIndex = 1;
            query = sql.replace(/\?/g, () => `$${paramIndex++}`);
        }
        
        try {
            const result = await this.query(query, params);
            return result.rows;
        } catch (err) {
            console.error('❌ Query error:', err.message);
            console.error('SQL:', query);
            console.error('Params:', params);
            throw err;
        }
    };

    poolInstance = pool;
    return pool;
}

const db = {
    runAsync: async (sql, params) => {
        const conn = await getDb();
        return conn.runAsync(sql, params);
    },
    getAsync: async (sql, params) => {
        const conn = await getDb();
        return conn.getAsync(sql, params);
    },
    allAsync: async (sql, params) => {
        const conn = await getDb();
        return conn.allAsync(sql, params);
    }
};

module.exports = { getDb, db };

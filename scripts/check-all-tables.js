const { db } = require('../src/config/database');

async function checkAllTables() {
    console.log('\n🔍 CHECKING ALL DATABASE TABLES');
    console.log('================================\n');

    try {
        // Get all tables
        const tables = await db.allAsync(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        
        console.log('📋 TABLES FOUND:');
        tables.forEach(t => console.log(`   • ${t.name}`));
        console.log('');

        // Check each table's structure and data
        for (const table of tables) {
            console.log(`\n📊 TABLE: ${table.name}`);
            console.log('─'.repeat(50));
            
            // Get table schema
            const schema = await db.allAsync(`PRAGMA table_info(${table.name})`);
            console.log('📋 Columns:');
            schema.forEach(col => {
                console.log(`   • ${col.name}: ${col.type} ${col.pk ? '(PRIMARY KEY)' : ''}`);
            });

            // Get row count
            const count = await db.getAsync(`SELECT COUNT(*) as count FROM ${table.name}`);
            console.log(`\n📈 Row count: ${count.count}`);

            // Show sample data (first 3 rows)
            if (count.count > 0) {
                const samples = await db.allAsync(`SELECT * FROM ${table.name} LIMIT 3`);
                console.log('\n📝 Sample data:');
                samples.forEach((row, i) => {
                    console.log(`   Row ${i + 1}:`);
                    Object.entries(row).forEach(([key, value]) => {
                        if (value !== null && value !== undefined) {
                            console.log(`      ${key}: ${value.toString().substring(0, 50)}${value.toString().length > 50 ? '...' : ''}`);
                        }
                    });
                });
            }
        }

        // Special check for deposits table
        console.log('\n\n💰 CHECKING DEPOSITS SPECIFICALLY');
        console.log('='.repeat(50));
        
        const deposits = await db.allAsync('SELECT * FROM deposits ORDER BY created_at DESC');
        console.log(`Total deposits: ${deposits.length}`);
        
        if (deposits.length > 0) {
            let totalAmount = 0;
            deposits.forEach((d, i) => {
                console.log(`\nDeposit ${i + 1}:`);
                console.log(`   ID: ${d.id}`);
                console.log(`   User ID: ${d.user_id}`);
                console.log(`   Token: ${d.token}`);
                console.log(`   Amount: ${d.amount}`);
                console.log(`   Status: ${d.status}`);
                console.log(`   Created: ${d.created_at}`);
                totalAmount += Number(d.amount) || 0;
            });
            console.log(`\n💰 TOTAL DEPOSITS: $${totalAmount.toFixed(2)}`);
        } else {
            console.log('❌ No deposits found!');
            
            // Check if there might be a different deposits table
            const possibleDepositTables = tables.filter(t => 
                t.name.includes('deposit') || t.name.includes('Deposit')
            );
            
            if (possibleDepositTables.length > 0) {
                console.log('\n⚠️ Found possible deposit tables:');
                possibleDepositTables.forEach(t => console.log(`   • ${t.name}`));
            }
        }

        // Check wallets for user balances
        console.log('\n\n👛 CHECKING WALLETS');
        console.log('='.repeat(50));
        
        const wallets = await db.allAsync('SELECT user_id, sol_balance, usdc_balance, usdt_balance FROM wallets');
        console.log(`Total wallets: ${wallets.length}`);
        
        if (wallets.length > 0) {
            let totalSol = 0, totalUsdc = 0, totalUsdt = 0;
            wallets.forEach(w => {
                totalSol += Number(w.sol_balance) || 0;
                totalUsdc += Number(w.usdc_balance) || 0;
                totalUsdt += Number(w.usdt_balance) || 0;
            });
            console.log(`💰 Total SOL: ${totalSol.toFixed(4)}`);
            console.log(`💰 Total USDC: $${totalUsdc.toFixed(2)}`);
            console.log(`💰 Total USDT: $${totalUsdt.toFixed(2)}`);
        }

        // Check if there's a separate transactions table
        const transactionsTable = tables.find(t => t.name === 'transactions');
        if (transactionsTable) {
            console.log('\n\n💳 CHECKING TRANSACTIONS TABLE');
            console.log('='.repeat(50));
            const transactions = await db.allAsync('SELECT * FROM transactions LIMIT 5');
            console.log('Sample transactions:', transactions);
        }

    } catch (error) {
        console.error('Error checking tables:', error);
    } finally {
        db.close();
    }
}

checkAllTables();

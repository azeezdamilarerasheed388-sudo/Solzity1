const { db } = require('../src/config/database');

async function checkWithdrawals() {
    console.log('\n🔍 CHECKING WITHDRAWALS TABLE');
    console.log('==============================\n');
    
    try {
        // Check if table exists
        const tableExists = await db.getAsync(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='withdrawals'"
        );
        
        if (!tableExists) {
            console.log('❌ Withdrawals table does not exist!');
            return;
        }
        
        console.log('✅ Withdrawals table exists');
        
        // Get table schema
        const schema = await db.allAsync("PRAGMA table_info(withdrawals)");
        console.log('\n📋 Table schema:');
        schema.forEach(col => {
            console.log(`   - ${col.name}: ${col.type}`);
        });
        
        // Count withdrawals
        const count = await db.getAsync('SELECT COUNT(*) as count FROM withdrawals');
        console.log(`\n📊 Total withdrawals: ${count.count}`);
        
        // Show sample withdrawals
        const samples = await db.allAsync('SELECT * FROM withdrawals LIMIT 5');
        console.log('\n📝 Sample withdrawals:');
        if (samples.length === 0) {
            console.log('   No withdrawals found');
        } else {
            samples.forEach(w => {
                console.log(`   ID: ${w.id}, User: ${w.user_id}, Amount: ${w.amount} ${w.token}, Status: ${w.status}`);
            });
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        db.close();
    }
}

checkWithdrawals();

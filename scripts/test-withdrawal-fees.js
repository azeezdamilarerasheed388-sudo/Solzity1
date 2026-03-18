const { db } = require('../src/config/database');
const withdrawalService = require('../src/services/withdrawalService');

async function testFees() {
    console.log('\n🔍 TESTING WITHDRAWAL FEES');
    console.log('==========================\n');

    try {
        // Direct database query
        const dbFees = await db.getAsync(
            'SELECT withdrawal_fee_sol, withdrawal_fee_usdc, withdrawal_fee_usdt FROM admin_settings WHERE id = 1'
        );
        console.log('📊 DATABASE FEES:');
        console.log(`   SOL:  ${dbFees?.withdrawal_fee_sol}`);
        console.log(`   USDC: ${dbFees?.withdrawal_fee_usdc}`);
        console.log(`   USDT: ${dbFees?.withdrawal_fee_usdt}`);

        // Get fees from service
        const serviceFees = await withdrawalService.getFees();
        console.log('\n📡 SERVICE FEES (getFees()):');
        console.log(`   SOL:  ${serviceFees.SOL}`);
        console.log(`   USDC: ${serviceFees.USDC}`);
        console.log(`   USDT: ${serviceFees.USDT}`);

        // Check if they match
        console.log('\n✅ MATCH CHECK:');
        console.log(`   SOL:  ${dbFees?.withdrawal_fee_sol === serviceFees.SOL ? '✓' : '✗'}`);
        console.log(`   USDC: ${dbFees?.withdrawal_fee_usdc === serviceFees.USDC ? '✓' : '✗'}`);
        console.log(`   USDT: ${dbFees?.withdrawal_fee_usdt === serviceFees.USDT ? '✓' : '✗'}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

testFees();

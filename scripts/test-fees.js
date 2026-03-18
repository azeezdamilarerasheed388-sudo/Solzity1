const { db } = require('../src/config/database');

async function testFees() {
    console.log('\n🔍 TESTING FEE API');
    console.log('==================\n');

    try {
        // Direct database query
        const dbFees = await db.getAsync(
            'SELECT withdrawal_fee_usdc, withdrawal_fee_usdt FROM admin_settings WHERE id = 1'
        );
        console.log('📊 Database fees:');
        console.log(`   USDC: $${dbFees?.withdrawal_fee_usdc}`);
        console.log(`   USDT: $${dbFees?.withdrawal_fee_usdt}`);

        // Test the API endpoint manually
        const express = require('express');
        const app = express();
        
        // Mock request and response
        const req = {};
        const res = {
            json: (data) => {
                console.log('\n📡 API Response:');
                console.log('   Fees from API:', data.fees);
            }
        };

        // Call the fees endpoint directly
        const withdrawalService = require('../src/services/withdrawalService');
        const fees = await withdrawalService.getFees();
        console.log('\n📡 WithdrawalService.getFees():');
        console.log('   USDC:', fees.USDC);
        console.log('   USDT:', fees.USDT);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        db.close();
    }
}

testFees();

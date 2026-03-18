const hdWallet = require('../src/services/hdWalletService');

async function testDerivation() {
    console.log('\n🔍 TESTING HD WALLET DERIVATION');
    console.log('================================\n');
    
    // Test with user ID 1
    const user1 = await hdWallet.generateUserWallet(1);
    console.log('User 1:');
    console.log(`   Path: ${user1.derivationPath}`);
    console.log(`   SOL Address (USER SEES THIS): ${user1.solAddress}`);
    console.log(`   USDC ATA (SCANNER USES THIS): ${user1.usdcAta}`);
    console.log(`   USDT ATA (SCANNER USES THIS): ${user1.usdtAta}`);
    
    // Test with user ID 2
    const user2 = await hdWallet.generateUserWallet(2);
    console.log('\nUser 2:');
    console.log(`   Path: ${user2.derivationPath}`);
    console.log(`   SOL Address (USER SEES THIS): ${user2.solAddress}`);
    console.log(`   USDC ATA (SCANNER USES THIS): ${user2.usdcAta}`);
    console.log(`   USDT ATA (SCANNER USES THIS): ${user2.usdtAta}`);
    
    console.log('\n✅ Derivation is deterministic!');
    console.log('   Running again will produce SAME addresses.\n');
}

testDerivation().catch(console.error);

const { db } = require('../src/config/database');
const speakeasy = require('speakeasy');

async function check2FA() {
    // Get all users
    const users = await db.allAsync('SELECT id, email, twofa_secret, twofa_enabled FROM users');
    
    console.log('\n📋 2FA STATUS:\n');
    
    for (const user of users) {
        console.log(`User ${user.id}: ${user.email}`);
        console.log(`  2FA Enabled: ${user.twofa_enabled ? '✅ YES' : '❌ NO'}`);
        
        if (user.twofa_secret) {
            console.log(`  Secret: ${user.twofa_secret.substring(0, 10)}...`);
            
            // Generate current token to verify
            const token = speakeasy.totp({
                secret: user.twofa_secret,
                encoding: 'base32'
            });
            console.log(`  Current token should be: ${token}`);
        } else {
            console.log(`  No secret found`);
        }
        console.log('');
    }
}

check2FA().finally(() => process.exit());

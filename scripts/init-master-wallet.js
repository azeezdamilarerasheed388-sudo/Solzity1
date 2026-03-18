const bip39 = require('bip39');
const fs = require('fs');
const path = require('path');

async function initializeMasterWallet() {
    const dir = './keys';
    const filePath = path.join(dir, 'master-mnemonic.txt');

    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    if (fs.existsSync(filePath)) {
        console.log("\n⚠️ Master mnemonic already exists at:", filePath);
        console.log("   Do not overwrite! If lost, all user funds are gone.\n");
        return;
    }

    // Generate a secure 24-word mnemonic
    const mnemonic = bip39.generateMnemonic(256); 
    fs.writeFileSync(filePath, mnemonic);
    
    console.log("\n✅ Master Mnemonic Generated and saved!");
    console.log("📁 Location:", filePath);
    console.log("\n‼️ BACKUP THIS PHRASE OFFLINE!");
    console.log("   If lost, all user funds are gone forever.\n");
}

initializeMasterWallet().catch(console.error);

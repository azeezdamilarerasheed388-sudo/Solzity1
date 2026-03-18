const { db } = require('../src/config/database');
const bcrypt = require('bcrypt');

async function createAdmin() {
    try {
        // Check if admin already exists
        const admin = await db.getAsync("SELECT id FROM users WHERE email = 'admin@cex.com'");
        
        if (!admin) {
            // Create admin user
            const hash = await bcrypt.hash('admin123', 10);
            const now = Math.floor(Date.now() / 1000);
            
            await db.runAsync(
                `INSERT INTO users (email, username, password_hash, is_admin, created_at) 
                 VALUES (?, ?, ?, ?, ?) RETURNING id`,
                ['admin@cex.com', 'admin', hash, 1, now]
            );
            console.log('✅ Admin user created successfully');
        } else {
            // Update existing admin to ensure is_admin=1
            await db.runAsync(
                "UPDATE users SET is_admin = 1 WHERE email = 'admin@cex.com'"
            );
            console.log('✅ Admin user updated successfully');
        }
        
        // Verify admin exists
        const verify = await db.getAsync(
            "SELECT id, email, is_admin FROM users WHERE email = 'admin@cex.com'"
        );
        console.log('📋 Admin user:', verify);
        
    } catch (error) {
        console.error('❌ Error creating admin:', error);
    } finally {
        db.close();
    }
}

createAdmin();

const { db } = require('../config/database-supabase');
const bcrypt = require('bcrypt');

class User {
    static async create(email, username, password) {
        const hash = await bcrypt.hash(password, 10);
        const now = Math.floor(Date.now() / 1000);
        
        const result = await db.runAsync(
            'INSERT INTO users (email, username, password_hash, is_admin, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
            [email, username, hash, false, false, now]
        );
        
        return { 
            id: result.lastID, 
            email, 
            username, 
            is_admin: false, 
            email_verified: false 
        };
    }

    static async findByEmail(email) {
        const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
        if (user) {
            user.is_admin = user.is_admin || false;
            user.email_verified = user.email_verified || false;
        }
        return user;
    }

    static async findById(id) {
        const user = await db.getAsync(
            'SELECT id, email, username, is_admin, email_verified, created_at FROM users WHERE id = ?',
            [id]
        );
        if (user) {
            user.is_admin = user.is_admin || false;
            user.email_verified = user.email_verified || false;
        }
        return user;
    }

    static async verifyPassword(user, password) {
        return await bcrypt.compare(password, user.password_hash);
    }
}

module.exports = User;

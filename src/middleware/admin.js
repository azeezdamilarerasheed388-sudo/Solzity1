const jwt = require('jsonwebtoken');
const { db } = require('../config/database-supabase');

const adminMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            console.log('❌ Admin: No token provided');
            return res.status(401).json({ error: 'No token provided' });
        }

        console.log('🔑 Admin: Verifying token...');
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await db.getAsync(
            'SELECT id, email, is_admin FROM users WHERE id = $1',
            [decoded.id]
        );
        
        if (!user) {
            console.log('❌ Admin: User not found');
            return res.status(401).json({ error: 'User not found' });
        }
        
        if (!user.is_admin) {
            console.log(`❌ Admin: User ${user.id} is not admin`);
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        console.log(`✅ Admin: Access granted for user ${user.id}`);
        req.user = decoded;
        req.user.is_admin = true;
        next();
    } catch (error) {
        console.error('❌ Admin middleware error:', error.message);
        res.status(401).json({ error: 'Invalid token' });
    }
};

module.exports = { adminMiddleware };

const jwt = require('jsonwebtoken');
const { getDb } = require('../../config/database-supabase');

module.exports = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const db = await getDb();
        const user = await db.getAsync('SELECT id FROM users WHERE id = $1', [decoded.id]);
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }
        
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

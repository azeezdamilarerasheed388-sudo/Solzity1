const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

module.exports = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verify user exists
        const db = new sqlite3.Database(path.join(__dirname, '../../data/cex-platform.db'));
        
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE id = ?', [decoded.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        db.close();
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }
        
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
    }
};

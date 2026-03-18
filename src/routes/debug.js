const express = require('express');
const router = express.Router();
const { db } = require('../config/database-supabase');

router.get('/admin-check', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.json({ error: 'No token provided' });
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await db.getAsync(
            'SELECT id, email, is_admin FROM users WHERE id = ?',
            [decoded.id]
        );
        
        res.json({
            success: true,
            user,
            token: decoded,
            isAdmin: user?.is_admin === 1
        });
        
    } catch (error) {
        res.json({ error: error.message });
    }
});

router.get('/tables', async (req, res) => {
    try {
        const tables = await db.allAsync(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        
        const tableInfo = {};
        for (const table of tables) {
            const columns = await db.allAsync(`PRAGMA table_info(${table.name})`);
            tableInfo[table.name] = columns;
        }
        
        res.json({ tables, tableInfo });
    } catch (error) {
        res.json({ error: error.message });
    }
});

router.get('/users', async (req, res) => {
    try {
        const users = await db.allAsync(
            'SELECT id, email, username, is_admin FROM users'
        );
        res.json({ users });
    } catch (error) {
        res.json({ error: error.message });
    }
});

module.exports = router;

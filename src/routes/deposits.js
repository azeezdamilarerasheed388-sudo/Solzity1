const express = require('express');
const router = express.Router();
const { db } = require('../config/database-supabase');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const deposits = await db.allAsync(
            `SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
            [req.user.id]
        );
        res.json({ deposits });
    } catch (error) {
        console.error('Error fetching deposits:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

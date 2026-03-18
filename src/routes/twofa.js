const express = require('express');
const router = express.Router();
const twofaService = require('../services/twofaService');
const { authMiddleware } = require('../middleware/auth');

// Generate 2FA secret and QR code
router.post('/setup', authMiddleware, async (req, res) => {
    try {
        const { email } = req.user;
        const result = await twofaService.generateSecret(req.user.id, email);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verify and enable 2FA
router.post('/verify', authMiddleware, async (req, res) => {
    try {
        const { token } = req.body;
        const verified = await twofaService.verifyToken(req.user.id, token);
        
        if (verified) {
            await twofaService.enable2FA(req.user.id);
            res.json({ success: true, message: '2FA enabled successfully' });
        } else {
            res.status(400).json({ error: 'Invalid verification code' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Disable 2FA
router.post('/disable', authMiddleware, async (req, res) => {
    try {
        const { token } = req.body;
        const verified = await twofaService.verifyToken(req.user.id, token);
        
        if (verified) {
            await twofaService.disable2FA(req.user.id);
            res.json({ success: true, message: '2FA disabled successfully' });
        } else {
            res.status(400).json({ error: 'Invalid verification code' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check 2FA status
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const enabled = await twofaService.isEnabled(req.user.id);
        res.json({ success: true, enabled });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

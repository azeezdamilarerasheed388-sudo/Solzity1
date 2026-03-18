const express = require('express');
const router = express.Router();
const enhancedAuthController = require('../controllers/enhancedAuthController');
const { authMiddleware } = require('../middleware/auth');
const { loginLimiter, registerLimiter, verifyLimiter } = require('../middleware/rateLimiter');

// Enhanced registration with email verification
router.post('/register', registerLimiter, enhancedAuthController.register);

// Email verification
router.post('/verify-email', authMiddleware, verifyLimiter, enhancedAuthController.verifyEmail);

// Resend verification code
router.post('/resend-verification', authMiddleware, verifyLimiter, enhancedAuthController.resendVerification);

// Enhanced login with alerts
router.post('/login', loginLimiter, enhancedAuthController.login);

module.exports = router;

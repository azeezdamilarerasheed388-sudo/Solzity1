require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { db } = require('./src/config/database-supabase');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// Trust proxy - important for rate limiting in Codespace
app.set('trust proxy', 1);

// Make io globally available
global.io = io;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== ROUTES ====================

// Auth routes
app.use('/api/auth', require('./src/routes/auth'));

// Wallet routes
app.use('/api/wallets', require('./src/routes/wallets'));

// Deposit routes
app.use('/api/deposits', require('./src/routes/deposits'));

// 2FA routes
app.use('/api/2fa', require('./src/routes/twofa'));

// Transfer routes
app.use('/api/transfers', require('./src/routes/transfers'));

// Balance routes
app.use('/api/balance', require('./src/routes/balance'));

// Withdrawal routes
app.use('/api/withdrawals', require('./src/routes/withdrawals'));

// Enhanced auth routes
app.use('/api/enhanced-auth', require('./src/routes/enhancedAuth'));

// ==================== ADMIN ROUTES ====================

// Master wallet routes
app.use('/api/master', require('./src/routes/masterWallet'));

// Admin stats routes
app.use('/api/admin/stats', require('./src/routes/admin/stats'));

// Admin limits routes
app.use('/api/admin/limits', require('./src/routes/admin/limits'));

// ==================== TRADING ROUTES ====================

// Trading routes
app.use('/api/trading-v2/balance', require('./src/routes/trading-v2/balance'));
app.use('/api/trading-v2/orders', require('./src/routes/trading-v2/orders'));
app.use('/api/trading-v2/orders-enhanced', require('./src/routes/trading-v2/orders-enhanced'));
app.use('/api/trading-v2/prices', require('./src/routes/trading-v2/prices'));
app.use('/api/trading-v2/test', require('./src/routes/trading-v2/test-liquidation'));

// ==================== DEBUG ROUTES ====================

app.use('/api/debug', require('./src/routes/debug'));
app.use('/api/routes', require('./src/routes/list-routes'));

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        network: process.env.SOLANA_NETWORK,
        time: new Date().toISOString()
    });
});

// ==================== HTML PAGES ====================

// Main pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/deposits', (req, res) => res.sendFile(path.join(__dirname, 'public', 'deposits.html')));
app.get('/withdraw', (req, res) => res.sendFile(path.join(__dirname, 'public', 'withdraw.html')));
app.get('/2fa-setup', (req, res) => res.sendFile(path.join(__dirname, 'public', '2fa-setup.html')));
app.get('/transfer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'transfer.html')));

// Enhanced auth pages
app.get('/login-enhanced', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login-enhanced.html'));
});
app.get('/register-enhanced', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register-enhanced.html'));
});
app.get('/verify-email', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'verify-email.html'));
});

// Admin pages
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/withdrawals', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'withdrawals.html')));
app.get('/admin/master-wallet', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'master-wallet.html')));
app.get('/admin/transfers', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'transfers.html')));
app.get('/admin/test', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'test.html')));
app.get('/admin/routes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'routes.html')));
app.get('/admin/stats', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'stats', 'index.html')));
app.get('/admin/limits', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'limits', 'index.html')));

// Trading pages
app.get('/trading-v2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trading-v2', 'index.html'));
});
app.get('/trading-v2/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trading-v2', 'dashboard.html'));
});

// ==================== WEB SOCKET ====================

// WebSocket authentication
io.on('connection', (socket) => {
    socket.on('authenticate', (token) => {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.join(`user-${decoded.id}`);
            console.log(`🔐 User ${decoded.id} authenticated`);
        } catch (error) {
            console.log('❌ WebSocket authentication failed');
        }
    });
});

// ==================== SERVICES ====================

// Import deposit scanner
const depositScanner = require('./src/services/depositScanner');
depositScanner.start();

// Import trading-v2 services
const priceOracle = require('./src/services/trading-v2/price-oracle');
const liquidationMonitor = require('./src/services/trading-v2/liquidation-monitor');
const slTpMonitor = require('./src/services/trading-v2/slTpMonitor');
const swapFeeService = require('./src/services/trading-v2/swapFeeService');
const { setupWebSocketV2 } = require('./src/services/trading-v2/websocket');

// Start all trading services
priceOracle.start();
liquidationMonitor.start();
slTpMonitor.start();
swapFeeService.start();

// Setup trading WebSocket
const tradingWss = setupWebSocketV2(server);

// Connect liquidation monitor to WebSocket
liquidationMonitor.setWebSocketServer(tradingWss);

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n✅ CEX Platform running!');
    console.log('=================================');
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📱 Mobile friendly design`);
    console.log(`🔗 Network: ${process.env.SOLANA_NETWORK}`);
    console.log(`📡 Deposit scanner: ACTIVE`);
    console.log(`📊 Trading V2: ACTIVE (Real Binance Prices)`);
    console.log('=================================\n');
});

module.exports = { server, io };

// Start email observer (NEW - doesn't modify existing code)
const emailObserver = require('./src/services/emailObserver');
emailObserver.start();

// Add referral routes
app.use('/api/referral', require('./src/routes/referral'));

// Add referral page
app.get('/referral', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'referral.html'));
});

// Start trading fee tracker
const tradingFeeTracker = require('./src/services/tradingFeeTracker');
tradingFeeTracker.start();

// Add competition routes
app.use('/api/competitions', require('./src/routes/competitions'));

// Add competition page
app.get('/competitions', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'competitions.html'));
});

// Start competition service and tracker
const competitionService = require('./src/services/competitionService');
const competitionTracker = require('./src/services/competitionTracker');
competitionService.start();
competitionTracker.start();

// Add admin competitions page
app.get('/admin/competitions', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'competitions.html'));
});

// ==================== ADMIN ROUTES ====================

// Admin user routes
app.use('/api/admin/users', require('./src/routes/admin/users'));

// ==================== ADMIN PAGES ====================

// Admin users page
app.get('/admin/users', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'users.html'));
});

// ==================== NGN ROUTES ====================

// Start NGN exchange rate service
const ngnExchangeRateService = require('./src/services/ngn/exchangeRateService');
ngnExchangeRateService.start();

// Add NGN routes
app.use('/api/ngn', require('./src/routes/ngn/index'));

// Add NGN page
app.get('/ngn', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ngn', 'index.html'));
});

// ==================== NGN ROUTES ====================

// Start NGN exchange rate service
try {
    const ngnExchangeRateService = require('./src/services/ngn/exchangeRateService');
    ngnExchangeRateService.start();
    console.log('✅ NGN exchange rate service started');
} catch (error) {
    console.error('❌ Failed to start NGN service:', error.message);
}

// Add NGN routes - FIXED PATH
try {
    const ngnRoutes = require('./src/routes/ngn/index');
    app.use('/api/ngn', ngnRoutes);
    console.log('✅ NGN API routes registered at /api/ngn');
} catch (error) {
    console.error('❌ Failed to load NGN routes:', error.message);
}

// Add NGN page
app.get('/ngn', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'ngn', 'index.html');
    console.log('📄 Serving NGN page from:', filePath);
    res.sendFile(filePath);
});

// Also add direct route for callback (in case the router isn't working)
app.get('/ngn/deposit/callback', async (req, res) => {
    console.log('📞 DIRECT CALLBACK HIT!');
    console.log('Query params:', req.query);
    
    const { reference, trxref } = req.query;
    const txRef = reference || trxref;
    
    if (!txRef) {
        console.error('No reference found');
        return res.redirect('/ngn?status=error&message=No reference');
    }

    try {
        // Try to import the service directly
        const paystackService = require('./src/services/ngn/paystackService');
        const result = await paystackService.verifyDeposit(txRef);
        
        if (result.success) {
            console.log(`✅ Deposit verified: ₦${result.amount}`);
            res.redirect(`/ngn?status=success&amount=${result.amount}`);
        } else {
            console.error('Verification failed:', result.error);
            res.redirect('/ngn?status=failed');
        }
    } catch (error) {
        console.error('Callback error:', error);
        res.redirect('/ngn?status=error');
    }
});

// Admin NGN withdrawals page
app.get('/admin/ngn-withdrawals', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'ngn-withdrawals.html'));
});
// ==================== TRADE HISTORY ROUTES ====================

// Add trade history API routes
app.use('/api/trading-v2', require('./src/routes/trading-v2/history'));

// Add trade history page
app.get('/trading-v2/history', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trading-v2', 'history.html'));
});

// ==================== SWAP FEE ADMIN ROUTES ====================

// Add swap fee admin routes
app.use('/api/admin/swap-fees', require('./src/routes/admin/swap-fees'));

// Add admin page
app.get('/admin/swap-fees', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'swap-fees.html'));
});

// ==================== PASSWORD RESET ROUTES ====================
// Add password reset functionality
app.use('/api/password-reset', require('./src/routes/passwordReset'));

// Password reset pages
app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// ==================== LEGAL PAGES ====================
app.get('/legal/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'legal', 'terms.html'));
});

app.get('/legal/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'legal', 'privacy.html'));
});

app.get('/legal/risk', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'legal', 'risk.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile', 'index.html'));
});

app.get('/support', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'support', 'index.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact', 'index.html'));
});

// ==================== HELP ARTICLES ====================
app.get('/help/how-to-trade', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'how-to-trade.html'));
});

app.get('/help/understanding-leverage', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'understanding-leverage.html'));
});

app.get('/help/fees', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'fees.html'));
});

app.get('/help/stop-loss-take-profit', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'stop-loss-take-profit.html'));
});

app.get('/help/liquidation', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'liquidation.html'));
});

app.get('/help/managing-positions', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'managing-positions.html'));
});

app.get('/help/deposit-ngn', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'deposit-ngn.html'));
});

app.get('/help/withdraw-ngn', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'withdraw-ngn.html'));
});

app.get('/help/deposit-crypto', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'deposit-crypto.html'));
});

app.get('/help/withdraw-crypto', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'withdraw-crypto.html'));
});

app.get('/help/enable-2fa', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'enable-2fa.html'));
});

app.get('/help/change-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'change-password.html'));
});

app.get('/help/email-verification', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'email-verification.html'));
});

app.get('/help/login-alerts', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'login-alerts.html'));
});

app.get('/help/account-lockout', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'account-lockout.html'));
});

app.get('/help/ngn-wallet', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'ngn-wallet.html'));
});

app.get('/help/ngn-to-usdc', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'ngn-to-usdc.html'));
});

app.get('/help/usdc-to-ngn', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'help', 'usdc-to-ngn.html'));
});

// ==================== CONTACT FORM ROUTES ====================
const contactRoutes = require('./src/routes/contact');
app.use('/api/contact', contactRoutes);

// Contact page
app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact', 'index.html'));
});

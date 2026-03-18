const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const priceOracle = require('./priceOracle');
const tradingService = require('./tradingService');
const transferService = require('./transferService');

function setupTradingWebSocket(server) {
    const wss = new WebSocket.Server({ server, path: '/ws-trading' });
    
    // Price updates to all connected clients
    priceOracle.onUpdate((prices) => {
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'PRICE_UPDATE',
                    data: prices
                }));
            }
        });
    });
    
    wss.on('connection', async (ws, req) => {
        // Get token from query string
        const urlParams = new URLSearchParams(req.url.split('?')[1]);
        const token = urlParams.get('token');
        
        if (!token) {
            ws.close();
            return;
        }
        
        try {
            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            ws.userId = decoded.id;
            
            console.log(`🔌 Trading WebSocket connected for user ${ws.userId}`);
            
            // Send initial data
            const balance = await transferService.getTradingBalance(ws.userId);
            const summary = await tradingService.getAccountSummary(ws.userId);
            const positions = await tradingService.getOpenPositions(ws.userId);
            const prices = priceOracle.getAllPrices();
            
            ws.send(JSON.stringify({
                type: 'INIT',
                data: {
                    balance,
                    summary,
                    positions,
                    prices
                }
            }));
            
            // Send periodic account updates
            const interval = setInterval(async () => {
                if (ws.readyState !== WebSocket.OPEN) {
                    clearInterval(interval);
                    return;
                }
                
                try {
                    const summary = await tradingService.getAccountSummary(ws.userId);
                    const positions = await tradingService.getOpenPositions(ws.userId);
                    
                    ws.send(JSON.stringify({
                        type: 'ACCOUNT_UPDATE',
                        data: { summary, positions }
                    }));
                } catch (error) {
                    console.error('Account update error:', error);
                }
            }, 1000); // Update every second
            
            ws.on('close', () => {
                clearInterval(interval);
                console.log(`🔌 Trading WebSocket disconnected for user ${ws.userId}`);
            });
            
        } catch (error) {
            console.error('WebSocket auth error:', error);
            ws.close();
        }
    });
    
    return wss;
}

module.exports = { setupTradingWebSocket };

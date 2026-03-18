const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { getDb } = require('../../config/database-supabase');
const priceOracle = require('./price-oracle');

function setupWebSocketV2(server) {
    const wss = new WebSocket.Server({ server, path: '/ws-v2' });
    
    console.log('🔌 WebSocket V2 server created at path: /ws-v2');
    
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
        console.log('🔗 New WebSocket connection attempt');
        
        const urlParams = new URLSearchParams(req.url.split('?')[1]);
        const token = urlParams.get('token');
        
        if (!token) {
            console.log('❌ No token provided, closing connection');
            ws.close();
            return;
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            ws.userId = decoded.id;
            console.log(`✅ WebSocket authenticated for user: ${decoded.username || decoded.id}`);
            
            const db = await getDb();
            
            const tradingBalance = await db.getAsync(
                'SELECT usdc_balance FROM trading_v2_balances WHERE user_id = $1',
                [ws.userId]
            );
            
            const positions = await db.allAsync(
                'SELECT * FROM trading_v2_positions WHERE user_id = $1 AND status = $2',
                [ws.userId, 'OPEN']
            );
            
            const prices = priceOracle.getAllPrices();
            console.log('📤 Sending INIT data with prices:', Object.keys(prices).map(k => `${k}: $${prices[k]?.mid}`).join(', '));
            
            ws.send(JSON.stringify({
                type: 'INIT',
                data: {
                    tradingBalance: tradingBalance?.usdc_balance || 0,
                    positions: positions.map(p => ({
                        ...p,
                        current_price: priceOracle.getPrice(p.asset, 'mid') || p.entry_price
                    })),
                    prices: prices
                }
            }));
            
        } catch (error) {
            console.error('❌ WebSocket auth error:', error.message);
            ws.close();
        }
    });
    
    return wss;
}

module.exports = { setupWebSocketV2 };

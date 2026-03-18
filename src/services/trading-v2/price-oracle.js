const WebSocket = require('ws');

class PriceOracleV2 {
    constructor() {
        // Initialize with empty prices
        this.prices = {
            'BTC/USDT': { bid: 0, ask: 0, mid: 0, change: 0 },
            'ETH/USDT': { bid: 0, ask: 0, mid: 0, change: 0 },
            'ETC/USDT': { bid: 0, ask: 0, mid: 0, change: 0 },
            'SOL/USDT': { bid: 0, ask: 0, mid: 0, change: 0 }
        };
        
        this.spreads = {
            'BTC/USDT': 10.00,
            'ETH/USDT': 1.00,
            'ETC/USDT': 0.02,
            'SOL/USDT': 0.06
        };
        
        this.updateCallbacks = [];
        this.ws = null;
        this.binanceSymbols = {
            'BTC/USDT': 'btcusdt',
            'ETH/USDT': 'ethusdt',
            'ETC/USDT': 'etcusdt',
            'SOL/USDT': 'solusdt'
        };
    }
    
    start() {
        console.log('📊 Connecting to Binance WebSocket for REAL prices...');
        this.connectWebSocket();
    }
    
    connectWebSocket() {
        // Create WebSocket connection to Binance
        const streams = Object.values(this.binanceSymbols).map(s => `${s}@ticker`).join('/');
        this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);
        
        this.ws.on('open', () => {
            console.log('✅ Connected to Binance WebSocket - Receiving REAL prices');
        });
        
        this.ws.on('message', (data) => {
            try {
                const ticker = JSON.parse(data);
                this.updatePriceFromTicker(ticker);
            } catch (error) {
                // Ignore parsing errors
            }
        });
        
        this.ws.on('error', (error) => {
            console.error('❌ Binance WebSocket error:', error.message);
            setTimeout(() => this.connectWebSocket(), 5000);
        });
        
        this.ws.on('close', () => {
            console.log('🔌 Binance WebSocket closed, reconnecting...');
            setTimeout(() => this.connectWebSocket(), 5000);
        });
    }
    
    updatePriceFromTicker(ticker) {
        const symbol = ticker.s.toLowerCase();
        let asset = null;
        
        // Find which asset this ticker belongs to
        for (let [key, value] of Object.entries(this.binanceSymbols)) {
            if (value === symbol) {
                asset = key;
                break;
            }
        }
        
        if (!asset) return;
        
        // Extract real data from Binance ticker
        const price = parseFloat(ticker.c);        // Current price
        const percentChange = parseFloat(ticker.P); // Percent change
        const highPrice = parseFloat(ticker.h);    // High price
        const lowPrice = parseFloat(ticker.l);     // Low price
        const volume = parseFloat(ticker.v);       // Volume
        const priceChange = parseFloat(ticker.p);  // Price change
        
        const spread = this.spreads[asset];
        
        // Update prices with REAL data
        this.prices[asset] = {
            bid: price - (spread / 2),
            ask: price + (spread / 2),
            mid: price,
            change: percentChange,
            high: highPrice,
            low: lowPrice,
            volume: volume,
            priceChange: priceChange
        };
        
        // Log real price to console
        console.log(`💰 REAL ${asset}: $${price.toFixed(2)} (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)}%)`);
        
        // Notify all callbacks
        this.updateCallbacks.forEach(cb => cb(this.prices));
    }
    
    onUpdate(callback) {
        this.updateCallbacks.push(callback);
    }
    
    getPrice(asset, type = 'mid') {
        return this.prices[asset] ? this.prices[asset][type] : 0;
    }
    
    getAllPrices() {
        return { ...this.prices };
    }
}

module.exports = new PriceOracleV2();

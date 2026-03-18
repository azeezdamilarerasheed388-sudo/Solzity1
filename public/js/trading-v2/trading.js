// Trading V2 JavaScript
let currentAsset = 'SOL/USDT';
let currentVolume = 0.01;
let ws = null;
let currentPrices = {};
let sltpEnabled = false;
let selectedToken = 'USDC';
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;

function getToken() {
    return localStorage.getItem('token');
}

function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login';
        return false;
    }
    return token;
}

function getUserFromToken() {
    const token = getToken();
    if (!token) return null;
    
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        return payload;
    } catch (error) {
        console.error('Error parsing token:', error);
        return null;
    }
}

function updateUserInfo() {
    const user = getUserFromToken();
    if (user) {
        document.getElementById('userName').textContent = user.username || user.email || 'User';
        document.getElementById('userAvatar').textContent = (user.username || 'U').charAt(0).toUpperCase();
    }
}

function toggleSLTP() {
    sltpEnabled = !sltpEnabled;
    const inputs = document.getElementById('sltpInputs');
    const badge = document.getElementById('sltpMode');
    
    if (sltpEnabled) {
        inputs.style.display = 'block';
        badge.textContent = 'Enabled';
        badge.classList.add('active');
    } else {
        inputs.style.display = 'none';
        badge.textContent = 'Click to enable';
        badge.classList.remove('active');
    }
}

function selectTransferToken(token) {
    selectedToken = token;
    document.getElementById('tokenUSDC').classList.remove('selected');
    document.getElementById('tokenUSDT').classList.remove('selected');
    document.getElementById(`token${token}`).classList.add('selected');
    document.getElementById('modalToken').textContent = token;
    
    // Update available amount
    const mainUSDC = parseFloat(document.getElementById('mainUSDC').textContent.replace('$', ''));
    const mainUSDT = parseFloat(document.getElementById('mainUSDT').textContent.replace('$', ''));
    const available = token === 'USDC' ? mainUSDC : mainUSDT;
    document.getElementById('modalAvailable').textContent = '$' + available.toFixed(2);
}

function initTradingView() {
    if (typeof TradingView !== 'undefined') {
        new TradingView.widget({
            "width": "100%",
            "height": 400,
            "symbol": "BINANCE:SOLUSDT",
            "interval": "1",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "toolbar_bg": "#f1f3f6",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "container_id": "tradingview_chart"
        });
    } else {
        setTimeout(initTradingView, 500);
    }
}

function switchAsset(asset) {
    currentAsset = asset;
    
    document.querySelectorAll('.asset-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    let symbol = 'BINANCE:SOLUSDT';
    if (asset === 'BTC/USDT') symbol = 'BINANCE:BTCUSDT';
    else if (asset === 'ETH/USDT') symbol = 'BINANCE:ETHUSDT';
    else if (asset === 'ETC/USDT') symbol = 'BINANCE:ETCUSDT';
    
    const container = document.getElementById('tradingview_chart');
    container.innerHTML = '';
    
    new TradingView.widget({
        "width": "100%",
        "height": 400,
        "symbol": symbol,
        "interval": "1",
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "container_id": "tradingview_chart"
    });
    
    updateOrderSummary();
}

function changeTimeframe(timeframe) {
    document.querySelectorAll('.timeframe-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    let symbol = 'BINANCE:SOLUSDT';
    if (currentAsset === 'BTC/USDT') symbol = 'BINANCE:BTCUSDT';
    else if (currentAsset === 'ETH/USDT') symbol = 'BINANCE:ETHUSDT';
    else if (currentAsset === 'ETC/USDT') symbol = 'BINANCE:ETCUSDT';
    
    const container = document.getElementById('tradingview_chart');
    container.innerHTML = '';
    
    new TradingView.widget({
        "width": "100%",
        "height": 400,
        "symbol": symbol,
        "interval": timeframe,
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "container_id": "tradingview_chart"
    });
}

function setVolume(volume) {
    currentVolume = volume;
    
    document.querySelectorAll('.volume-btn').forEach(btn => {
        btn.classList.remove('active');
        if (parseFloat(btn.textContent) === volume) {
            btn.classList.add('active');
        }
    });
    
    updateOrderSummary();
}

function updateOrderSummary() {
    const price = currentPrices[currentAsset]?.mid || 0;
    const contractSizes = {
        'BTC/USDT': 1,
        'ETH/USDT': 20,
        'ETC/USDT': 1000,
        'SOL/USDT': 100
    };
    
    const size = contractSizes[currentAsset] || 100;
    const positionValue = currentVolume * size * price;
    const margin = positionValue / 100;
    const fee = currentVolume * 15;
    const total = margin + fee;
    
    document.getElementById('margin').textContent = '$' + (margin || 0).toFixed(2);
    document.getElementById('fee').textContent = '$' + (fee || 0).toFixed(2);
    document.getElementById('total').textContent = '$' + (total || 0).toFixed(2);
    
    if (currentPrices[currentAsset]) {
        document.getElementById('sellBtn').textContent = 'Sell $' + (currentPrices[currentAsset].bid || 0).toFixed(2);
        document.getElementById('buyBtn').textContent = 'Buy $' + (currentPrices[currentAsset].ask || 0).toFixed(2);
        document.getElementById('spread').textContent = ((currentPrices[currentAsset].ask || 0) - (currentPrices[currentAsset].bid || 0)).toFixed(2);
    }
}

async function placeOrder(side) {
    const token = checkAuth();
    if (!token) return;
    
    try {
        const response = await fetch('/api/trading-v2/orders/open', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                asset: currentAsset,
                volume: currentVolume,
                side: side
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadBalances();
            loadPositions();
        } else {
            showNotification(data.error || 'Failed to place order', 'error');
        }
    } catch (error) {
        console.error('Order error:', error);
        showNotification('Failed to place order', 'error');
    }
}

async function placeOrderWithSLTP(side) {
    const token = checkAuth();
    if (!token) return;
    
    const stopLoss = parseFloat(document.getElementById('stopLoss').value);
    const takeProfit = parseFloat(document.getElementById('takeProfit').value);
    
    if (isNaN(stopLoss) && isNaN(takeProfit)) {
        showNotification('Please set at least Stop Loss or Take Profit', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/trading-v2/orders-enhanced/open-enhanced', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                asset: currentAsset,
                volume: currentVolume,
                side: side,
                stopLoss: isNaN(stopLoss) ? null : stopLoss,
                takeProfit: isNaN(takeProfit) ? null : takeProfit
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadBalances();
            loadPositions();
            // Clear SL/TP inputs
            document.getElementById('stopLoss').value = '';
            document.getElementById('takeProfit').value = '';
        } else {
            showNotification(data.error || 'Failed to place order', 'error');
        }
    } catch (error) {
        console.error('Order error:', error);
        showNotification('Failed to place order', 'error');
    }
}

async function loadBalances() {
    const token = checkAuth();
    if (!token) return;
    
    try {
        const response = await fetch('/api/trading-v2/balance', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('tradingBalance').textContent = '$' + (data.data?.tradingUSDT || 0).toFixed(2);
            document.getElementById('mainUSDC').textContent = '$' + (data.data?.mainUSDC || 0).toFixed(2);
            document.getElementById('mainUSDT').textContent = '$' + (data.data?.mainUSDT || 0).toFixed(2);
        }
    } catch (error) {
        console.error('Failed to load balances:', error);
    }
}

async function loadPositions() {
    const token = checkAuth();
    if (!token) return;
    
    try {
        const response = await fetch('/api/trading-v2/orders/positions', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
            displayPositions(data.data);
        } else {
            document.getElementById('positionsList').innerHTML = '<div style="color: #8E8E93; text-align: center; padding: 40px;">No open positions</div>';
        }
    } catch (error) {
        console.error('Failed to load positions:', error);
    }
}

function displayPositions(positions) {
    const container = document.getElementById('positionsList');
    const contractSizes = {
        'BTC/USDT': 1,
        'ETH/USDT': 20,
        'ETC/USDT': 1000,
        'SOL/USDT': 100
    };
    
    let html = '';
    
    positions.forEach(pos => {
        const currentPrice = currentPrices[pos.asset]?.mid || pos.entry_price;
        const priceDiff = currentPrice - pos.entry_price;
        const adjustedDiff = pos.side === 'BUY' ? priceDiff : -priceDiff;
        const pnl = adjustedDiff * pos.volume * (contractSizes[pos.asset] || 100);
        const pnlClass = pnl >= 0 ? 'profit' : 'loss';
        
        html += `
            <div class="position-card ${pnlClass}">
                <div class="position-header">
                    <span class="position-asset">${pos.asset}</span>
                    <span class="position-side ${pos.side}">${pos.side}</span>
                </div>
                <div class="position-details">
                    <div>Volume: ${pos.volume}</div>
                    <div>Entry: $${pos.entry_price.toFixed(2)}</div>
                    <div>Current: $${currentPrice.toFixed(2)}</div>
                </div>
                ${pos.stop_loss || pos.take_profit ? `
                <div class="position-sltp">
                    ${pos.stop_loss ? `<span class="position-sl">SL: $${pos.stop_loss.toFixed(2)}</span>` : ''}
                    ${pos.take_profit ? `<span class="position-tp">TP: $${pos.take_profit.toFixed(2)}</span>` : ''}
                </div>
                ` : ''}
                <div class="position-pnl ${pnlClass}">
                    ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT
                </div>
                <button class="close-btn" onclick="closePosition('${pos.id}')">Close</button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function closePosition(positionId) {
    const token = checkAuth();
    if (!token) return;
    
    try {
        const response = await fetch('/api/trading-v2/orders/close', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ positionId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadPositions();
            loadBalances();
        } else {
            showNotification(data.error || 'Failed to close position', 'error');
        }
    } catch (error) {
        console.error('Close position error:', error);
        showNotification('Failed to close position', 'error');
    }
}

function showTransferModal(type) {
    const token = checkAuth();
    if (!token) return;
    
    const modal = document.getElementById('transferModal');
    const title = document.getElementById('modalTitle');
    
    if (type === 'to-trading') {
        title.textContent = 'Transfer to Trading';
    } else {
        title.textContent = 'Transfer to Main';
    }
    
    modal.dataset.type = type;
    selectTransferToken('USDC'); // Default to USDC
    modal.classList.add('active');
}

function closeTransferModal() {
    document.getElementById('transferModal').classList.remove('active');
    document.getElementById('transferAmount').value = '';
}

async function confirmTransfer() {
    const token = checkAuth();
    if (!token) return;
    
    const amount = parseFloat(document.getElementById('transferAmount').value);
    const type = document.getElementById('transferModal').dataset.type;
    const token_sel = selectedToken;
    
    if (!amount || amount <= 0) {
        showNotification('Please enter a valid amount', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/trading-v2/balance/${type}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                amount,
                token: token_sel 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            closeTransferModal();
            loadBalances();
        } else {
            showNotification(data.error || 'Transfer failed', 'error');
        }
    } catch (error) {
        console.error('Transfer error:', error);
        showNotification('Transfer failed', 'error');
    }
}

function showNotification(message, type) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function connectWebSocket() {
    const token = checkAuth();
    if (!token) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws-v2?token=${token}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        reconnectAttempts = 0;
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'PRICE_UPDATE') {
                currentPrices = data.data;
                updateOrderSummary();
                loadPositions();
            } else if (data.type === 'INIT') {
                if (data.data.prices) {
                    currentPrices = data.data.prices;
                }
                if (data.data.positions) displayPositions(data.data.positions);
                if (data.data.tradingBalance !== undefined) {
                    document.getElementById('tradingBalance').textContent = '$' + data.data.tradingBalance.toFixed(2);
                }
                updateOrderSummary();
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(connectWebSocket, 3000);
        }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const token = checkAuth();
    if (!token) return;
    
    updateUserInfo();
    initTradingView();
    loadBalances();
    loadPositions();
    connectWebSocket();
    
    setInterval(loadBalances, 10000);
    setInterval(loadPositions, 5000);
});

// Make functions global
window.switchAsset = switchAsset;
window.changeTimeframe = changeTimeframe;
window.setVolume = setVolume;
window.placeOrder = placeOrder;
window.placeOrderWithSLTP = placeOrderWithSLTP;
window.toggleSLTP = toggleSLTP;
window.showTransferModal = showTransferModal;
window.closeTransferModal = closeTransferModal;
window.confirmTransfer = confirmTransfer;
window.selectTransferToken = selectTransferToken;
window.closePosition = closePosition;

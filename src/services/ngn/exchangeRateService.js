const axios = require('axios');
const { db } = require('../../config/database-supabase');

class ExchangeRateService {
    constructor() {
        this.realRate = 1500; // Default real rate
        this.spread = 80; // 80 NGN spread (subtracted when buying)
        this.updateInterval = 5 * 60 * 1000; // 5 minutes
        this.listeners = [];
    }

    async start() {
        await this.updateRate();
        setInterval(() => this.updateRate(), this.updateInterval);
        console.log('💱 NGN Exchange rate service started');
        console.log(`   Real rate: ₦${this.realRate}`);
        console.log(`   Buy USDC: ₦${this.realRate - this.spread} (real - 80 spread)`);
        console.log(`   Sell USDC: ₦${this.realRate} (real rate)`);
    }

    onRateChange(callback) {
        this.listeners.push(callback);
    }

    async updateRate() {
        try {
            // Try multiple free APIs
            let rate = null;
            
            // Try 1: exchangerate-api.com
            try {
                const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
                rate = response.data.rates.NGN;
            } catch (e) {
                console.log('Primary API failed, trying backup...');
            }

            // Try 2: currencyapi.com
            if (!rate) {
                try {
                    const response = await axios.get('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
                    rate = response.data.usd.ngn;
                } catch (e) {}
            }

            if (rate && rate > 0 && rate < 2000) {
                this.realRate = rate;
                
                // Store in database
                await db.runAsync(
                    `INSERT INTO exchange_rates (usd_to_ngn, created_at) VALUES ($1, $2)`,
                    [rate, Math.floor(Date.now() / 1000)]
                );
                
                // Notify listeners
                this.listeners.forEach(cb => cb({
                    real: this.realRate,
                    buy: this.getBuyRate(),
                    sell: this.getSellRate(),
                    spread: this.spread
                }));
                
                console.log(`💱 USD/NGN real rate: ₦${rate}`);
                console.log(`   Buy USDC: ₦${this.getBuyRate()} (real - ${this.spread})`);
                console.log(`   Sell USDC: ₦${this.getSellRate()} (real)`);
            }
        } catch (error) {
            console.error('Failed to fetch rate:', error.message);
        }
    }

    // Get real rate (for display)
    getRealRate() {
        return this.realRate;
    }

    // Rate when BUYING USDC (paying NGN) - real rate MINUS spread
    getBuyRate() {
        return this.realRate - this.spread;
    }

    // Rate when SELLING USDC (receiving NGN) - real rate
    getSellRate() {
        return this.realRate;
    }

    // Convert NGN to USDC (buying USDC) - uses buy rate (lower)
    ngnToUsdc(ngnAmount) {
        const usdcAmount = ngnAmount / this.getBuyRate();
        const platformProfit = ngnAmount - (usdcAmount * this.realRate);
        
        return {
            usdcAmount,
            rate: this.getBuyRate(),
            realRate: this.realRate,
            spread: this.spread,
            platformProfit
        };
    }

    // Convert USDC to NGN (selling USDC) - uses sell rate (real)
    usdcToNgn(usdcAmount) {
        const ngnAmount = usdcAmount * this.getSellRate();
        return {
            ngnAmount,
            rate: this.getSellRate(),
            realRate: this.realRate,
            spread: 0,
            platformProfit: 0
        };
    }

    // NGN to USDT
    ngnToUsdt(ngnAmount) {
        const usdtAmount = ngnAmount / this.getBuyRate();
        const platformProfit = ngnAmount - (usdtAmount * this.realRate);
        
        return {
            usdtAmount,
            rate: this.getBuyRate(),
            realRate: this.realRate,
            spread: this.spread,
            platformProfit
        };
    }

    // USDT to NGN
    usdtToNgn(usdtAmount) {
        const ngnAmount = usdtAmount * this.getSellRate();
        return {
            ngnAmount,
            rate: this.getSellRate(),
            realRate: this.realRate,
            spread: 0,
            platformProfit: 0
        };
    }
}

module.exports = new ExchangeRateService();

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../../config/database-supabase');

class PaystackService {
    constructor() {
        this.secretKey = process.env.PAYSTACK_SECRET_KEY;
        this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;
        this.baseUrl = 'https://api.paystack.co';
        
        // Test mode account verification codes (always work in test mode)
        this.testAccounts = [
            { bankCode: '001', accountNumber: '1234567890', accountName: 'Test Account 1' },
            { bankCode: '001', accountNumber: '1234567891', accountName: 'Test Account 2' },
            { bankCode: '001', accountNumber: '1234567892', accountName: 'Test Account 3' },
            { bankCode: '001', accountNumber: '8138005300', accountName: 'John Doe' },
            { bankCode: '001', accountNumber: '0123456789', accountName: 'Adeoluwa Ogunbanwo' },
            { bankCode: '058', accountNumber: '0123456789', accountName: 'GTBank Test Account' },
            { bankCode: '032', accountNumber: '0123456789', accountName: 'UBA Test Account' }
        ];
    }

    // Check if we're in test mode
    isTestMode() {
        return this.secretKey && this.secretKey.startsWith('sk_test_');
    }

    async initializeDeposit(userId, email, ngnAmount) {
        try {
            const reference = `NGN_${uuidv4().substring(0, 8)}_${Date.now()}`;
            
            console.log(`💰 Initializing deposit: ${ngnAmount} NGN for user ${userId}, ref: ${reference}`);
            
            await db.runAsync(
                `INSERT INTO ngn_deposits 
                 (user_id, reference, ngn_amount, created_at)
                 VALUES ($1, $2, $3, $4)`,
                [userId, reference, ngnAmount, Math.floor(Date.now() / 1000)]
            );

            const response = await axios.post(`${this.baseUrl}/transaction/initialize`, {
                email: email,
                amount: Math.round(ngnAmount * 100),
                reference: reference,
                callback_url: `${process.env.BASE_URL || 'http://localhost:3000'}/ngn/deposit/callback`,
                metadata: {
                    user_id: userId,
                    purpose: 'NGN Deposit'
                }
            }, {
                headers: {
                    Authorization: `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                authorization_url: response.data.data.authorization_url,
                reference: reference
            };

        } catch (error) {
            console.error('❌ Paystack deposit error:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    async verifyDeposit(reference) {
        try {
            console.log(`🔍 Verifying deposit: ${reference}`);
            
            const response = await axios.get(`${this.baseUrl}/transaction/verify/${reference}`, {
                headers: { Authorization: `Bearer ${this.secretKey}` }
            });

            const data = response.data.data;

            if (data.status === 'success') {
                const deposit = await db.getAsync(
                    'SELECT * FROM ngn_deposits WHERE reference = $1',
                    [reference]
                );

                if (!deposit) {
                    const metadata = data.metadata;
                    if (metadata && metadata.user_id) {
                        await db.runAsync('BEGIN TRANSACTION');
                        
                        await db.runAsync(
                            `INSERT INTO ngn_deposits 
                             (user_id, reference, ngn_amount, status, paid_at, payment_method, created_at)
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [
                                metadata.user_id, 
                                reference, 
                                data.amount / 100, 
                                'completed',
                                Math.floor(Date.now() / 1000),
                                data.channel,
                                Math.floor(Date.now() / 1000)
                            ]
                        );

                        const balanceService = require('./balanceService');
                        await balanceService.credit(metadata.user_id, data.amount / 100);

                        await db.runAsync('COMMIT');
                        
                        return {
                            success: true,
                            amount: data.amount / 100,
                            userId: metadata.user_id
                        };
                    }
                }

                if (deposit && deposit.status === 'pending') {
                    await db.runAsync('BEGIN TRANSACTION');

                    await db.runAsync(
                        `UPDATE ngn_deposits 
                         SET status = 'completed', 
                             paid_at = $1,
                             payment_method = $2
                         WHERE id = $3`,
                        [Math.floor(Date.now() / 1000), data.channel, deposit.id]
                    );

                    const balanceService = require('./balanceService');
                    await balanceService.credit(deposit.user_id, deposit.ngn_amount);

                    await db.runAsync('COMMIT');

                    return {
                        success: true,
                        amount: deposit.ngn_amount,
                        userId: deposit.user_id
                    };
                }

                return {
                    success: true,
                    amount: deposit?.ngn_amount || data.amount / 100,
                    userId: deposit?.user_id || data.metadata?.user_id
                };
            }

            return { success: false, error: 'Payment not successful' };

        } catch (error) {
            console.error('Paystack verification error:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    async getBanks() {
        try {
            // In test mode, return a list of test banks
            if (this.isTestMode()) {
                console.log('🧪 Using test mode banks');
                return [
                    { code: '001', name: 'Test Bank (Use for verification)', slug: 'test-bank' },
                    { code: '058', name: 'GTBank (Test)', slug: 'gtbank-test' },
                    { code: '032', name: 'UBA (Test)', slug: 'uba-test' },
                    { code: '044', name: 'Access Bank (Test)', slug: 'access-test' },
                    { code: '011', name: 'First Bank (Test)', slug: 'firstbank-test' }
                ];
            }

            // Live mode - fetch from Paystack
            const response = await axios.get(`${this.baseUrl}/bank`, {
                headers: { Authorization: `Bearer ${this.secretKey}` },
                params: { country: 'nigeria' }
            });
            
            return response.data.data;
            
        } catch (error) {
            console.error('Error fetching banks:', error);
            // Fallback to test banks
            return [
                { code: '001', name: 'Test Bank', slug: 'test-bank' }
            ];
        }
    }

    // FIXED: Account verification that works in test mode
    async verifyAccount(accountNumber, bankCode) {
        try {
            console.log(`🔍 Verifying account: ${accountNumber} with bank code: ${bankCode}`);
            
            // Validate inputs
            if (!accountNumber || accountNumber.length !== 10) {
                return { 
                    success: false, 
                    error: 'Account number must be 10 digits' 
                };
            }

            if (!bankCode) {
                return { 
                    success: false, 
                    error: 'Please select a bank' 
                };
            }

            // TEST MODE: Use predefined test accounts
            if (this.isTestMode()) {
                console.log('🧪 Using test mode verification');
                
                // Map of test account numbers to names
                const testAccountNames = {
                    '8138005300': 'John Doe',
                    '0123456789': 'Adeoluwa Ogunbanwo',
                    '1234567890': 'Test User 1',
                    '1234567891': 'Test User 2',
                    '1234567892': 'Test User 3'
                };

                // Check if this account exists in our test map
                if (testAccountNames[accountNumber]) {
                    return {
                        success: true,
                        accountName: testAccountNames[accountNumber],
                        accountNumber: accountNumber
                    };
                }

                // If not in map, still return a generic name
                return {
                    success: true,
                    accountName: `Test Account (${accountNumber})`,
                    accountNumber: accountNumber
                };
            }

            // LIVE MODE: Call Paystack API
            try {
                const response = await axios.get(`${this.baseUrl}/bank/resolve`, {
                    headers: { 
                        Authorization: `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    },
                    params: { 
                        account_number: accountNumber, 
                        bank_code: bankCode 
                    },
                    timeout: 10000
                });

                console.log('✅ Account verified successfully:', response.data.data);
                
                return {
                    success: true,
                    accountName: response.data.data.account_name,
                    accountNumber: response.data.data.account_number
                };

            } catch (error) {
                console.error('❌ Account verification failed:', error.response?.data || error.message);
                
                if (error.response?.data?.message) {
                    return { 
                        success: false, 
                        error: error.response.data.message 
                    };
                }
                
                return { 
                    success: false, 
                    error: 'Verification failed. Please try again.' 
                };
            }

        } catch (error) {
            console.error('Verification error:', error);
            return { 
                success: false, 
                error: 'Could not verify account' 
            };
        }
    }

    async initiateWithdrawal(userId, ngnAmount, bankCode, accountNumber, accountName) {
        try {
            const balanceService = require('./balanceService');
            const currentBalance = await balanceService.getBalance(userId);
            
            if (currentBalance < ngnAmount) {
                return { success: false, error: 'Insufficient NGN balance' };
            }

            // For test mode, we don't need to verify again
            if (!this.isTestMode()) {
                const verifyResult = await this.verifyAccount(accountNumber, bankCode);
                if (!verifyResult.success) {
                    return { success: false, error: 'Account verification failed' };
                }
            }

            const reference = `NGN_WIT_${uuidv4().substring(0, 8)}_${Date.now()}`;

            let bankName = 'Test Bank';
            if (!this.isTestMode()) {
                const bank = await db.getAsync(
                    'SELECT name FROM nigerian_banks WHERE code = $1',
                    [bankCode]
                );
                bankName = bank?.name || 'Unknown';
            }

            await db.runAsync('BEGIN TRANSACTION');

            await balanceService.debit(userId, ngnAmount);

            await db.runAsync(
                `INSERT INTO ngn_withdrawals 
                 (user_id, reference, ngn_amount, bank_code, account_number, account_name, bank_name, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    userId, reference, ngnAmount, bankCode, accountNumber, 
                    accountName,
                    bankName, 
                    Math.floor(Date.now() / 1000)
                ]
            );

            await db.runAsync('COMMIT');

            return {
                success: true,
                reference: reference,
                amount: ngnAmount,
                accountName: accountName
            };

        } catch (error) {
            await db.runAsync('ROLLBACK');
            console.error('Withdrawal error:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new PaystackService();

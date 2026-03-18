const { BrevoClient } = require('@getbrevo/brevo');

class EmailService {
    constructor() {
        this.brevo = new BrevoClient({
            apiKey: process.env.BREVO_API_KEY,
            timeoutInSeconds: 30,
            maxRetries: 3
        });
        
        this.sender = {
            name: 'Solzity',
            email: process.env.FROM_EMAIL || 'noreply@solzity.com'
        };
        
        console.log('📧 Email service using Brevo');
        console.log(`   Sender: ${this.sender.name} <${this.sender.email}>`);
    }

    // 1. Verification Email
    async sendVerificationEmail(email, username, code) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: '✅ Verify Your Email - Solzity',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #2563eb; font-size: 32px;">Solzity</h1>
                        </div>
                        
                        <h2 style="color: #2563eb;">Welcome ${username}! 🎉</h2>
                        <p>Please verify your email address to start trading.</p>
                        
                        <div style="background: #f3f4f6; padding: 30px; text-align: center; border-radius: 8px; margin: 20px 0;">
                            <p style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">Your verification code is:</p>
                            <div style="font-size: 42px; letter-spacing: 8px; font-weight: bold; color: #2563eb; font-family: monospace;">
                                ${code}
                            </div>
                            <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">This code expires in 10 minutes</p>
                        </div>
                        
                        <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #6b7280; font-size: 12px;">Need help? Contact support@solzity.com</p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Verification email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (verification):', error.message);
            return null;
        }
    }

    // 2. Welcome Email
    async sendWelcomeEmail(email, username) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: '🎉 Welcome to Solzity!',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #2563eb; font-size: 32px;">Solzity</h1>
                        </div>
                        
                        <h2 style="color: #2563eb;">Welcome ${username}! 🎉</h2>
                        <p>Your account has been successfully created and verified.</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0;">✨ What you can do now:</h3>
                            <ul style="list-style-type: none; padding: 0;">
                                <li style="margin: 10px 0;">💰 Deposit SOL, USDC, USDT</li>
                                <li style="margin: 10px 0;">📊 Trade with 100x leverage</li>
                                <li style="margin: 10px 0;">🔄 Transfer funds to other users</li>
                                <li style="margin: 10px 0;">🔐 Enable 2FA for extra security</li>
                            </ul>
                        </div>

                        <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #6b7280; font-size: 12px;">Need help? Contact support@solzity.com</p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Welcome email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (welcome):', error.message);
            return null;
        }
    }

    // 3. Login Alert
    async sendLoginAlert(email, username, ip, device, location = 'Unknown') {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: '🔐 New Login Detected - Solzity',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #2563eb; font-size: 32px;">Solzity</h1>
                        </div>
                        
                        <h2 style="color: #2563eb;">Security Alert</h2>
                        <p>Hello ${username},</p>
                        <p>A new login was detected on your account:</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                            <p><strong>IP Address:</strong> ${ip}</p>
                            <p><strong>Location:</strong> ${location}</p>
                            <p><strong>Device:</strong> ${device}</p>
                        </div>
                        
                        <div style="background: #e6f7ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; color: #0052cc;">✅ If this was you, you can ignore this email.</p>
                        </div>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Login alert sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (login alert):', error.message);
            return null;
        }
    }

    // 4. Deposit Confirmation
    async sendDepositConfirmation(email, username, amount, token, txHash) {
        try {
            const explorerLink = `https://solscan.io/tx/${txHash}?cluster=devnet`;
            
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: `💰 Deposit Confirmed: ${amount} ${token}`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2563eb;">Deposit Confirmed! ✅</h2>
                        <p>Hello ${username},</p>
                        <p>Your deposit has been confirmed:</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p style="font-size: 24px; text-align: center;"><strong>${amount} ${token}</strong></p>
                        </div>
                        
                        <p><a href="${explorerLink}" target="_blank">View on Solscan 🔍</a></p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Deposit email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (deposit):', error.message);
            return null;
        }
    }

    // 5. Withdrawal Request
    async sendWithdrawalRequest(email, username, amount, token, address) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: `📤 Withdrawal Request: ${amount} ${token}`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2563eb;">Withdrawal Request Received</h2>
                        <p>Hello ${username},</p>
                        <p>Your withdrawal request is being processed:</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
                            <p><strong>Amount:</strong> ${amount} ${token}</p>
                            <p><strong>Destination:</strong> ${address.substring(0, 20)}...</p>
                            <p><strong>Status:</strong> Pending Approval</p>
                        </div>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Withdrawal request email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (withdrawal request):', error.message);
            return null;
        }
    }

    // 6. Withdrawal Approved
    async sendWithdrawalApproved(email, username, amount, token, txHash) {
        try {
            const explorerLink = `https://solscan.io/tx/${txHash}?cluster=devnet`;
            
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: `✅ Withdrawal Approved: ${amount} ${token}`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2563eb;">Withdrawal Approved! ✅</h2>
                        <p>Hello ${username},</p>
                        <p>Your withdrawal has been sent:</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
                            <p><strong>Amount:</strong> ${amount} ${token}</p>
                            <p><a href="${explorerLink}" target="_blank">View Transaction</a></p>
                        </div>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Withdrawal approved email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (withdrawal approved):', error.message);
            return null;
        }
    }

    // 7. Withdrawal Declined
    async sendWithdrawalDeclined(email, username, amount, token, reason) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: `❌ Withdrawal Declined: ${amount} ${token}`,
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #dc2626;">Withdrawal Declined</h2>
                        <p>Hello ${username},</p>
                        <p>Your withdrawal request has been declined:</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
                            <p><strong>Amount:</strong> ${amount} ${token}</p>
                            <p><strong>Reason:</strong> ${reason}</p>
                        </div>
                        
                        <p>Funds have been returned to your account balance.</p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Withdrawal declined email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (withdrawal declined):', error.message);
            return null;
        }
    }

    // 8. 2FA Enabled
    async send2FAEnabled(email, username, device) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: '🔐 Two-Factor Authentication Enabled',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2563eb;">2FA Enabled Successfully</h2>
                        <p>Hello ${username},</p>
                        <p>Two-factor authentication has been enabled on your account.</p>
                        <p><strong>Device:</strong> ${device}</p>
                        <p>Your account is now more secure!</p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ 2FA enabled email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (2FA enabled):', error.message);
            return null;
        }
    }

    // 9. 2FA Disabled
    async send2FADisabled(email, username, device) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: '⚠️ Two-Factor Authentication Disabled',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #f59e0b;">2FA Disabled</h2>
                        <p>Hello ${username},</p>
                        <p>Two-factor authentication has been disabled on your account.</p>
                        <p><strong>Device:</strong> ${device}</p>
                        <p>If you didn't do this, please secure your account immediately.</p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ 2FA disabled email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (2FA disabled):', error.message);
            return null;
        }
    }

    // 10. Security Alert
    async sendSecurityAlert(email, username, activity, ip, location) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: '🚨 Suspicious Activity Detected',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #dc2626;">Security Alert</h2>
                        <p>Hello ${username},</p>
                        <p>We detected suspicious activity on your account:</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
                            <p><strong>Activity:</strong> ${activity}</p>
                            <p><strong>IP Address:</strong> ${ip}</p>
                            <p><strong>Location:</strong> ${location || 'Unknown'}</p>
                            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        
                        <p>If this wasn't you, please secure your account immediately.</p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Security alert sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (security alert):', error.message);
            return null;
        }
    }

    // 11. Password Reset Email
    async sendPasswordResetEmail(email, username, resetLink) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: '🔐 Password Reset Request - Solzity',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #2563eb; font-size: 32px;">Solzity</h1>
                        </div>
                        
                        <h2 style="color: #2563eb;">Password Reset Request</h2>
                        <p>Hello ${username},</p>
                        <p>We received a request to reset your password. Click the button below to create a new password:</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetLink}" 
                               style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                                Reset Password
                            </a>
                        </div>
                        
                        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; color: #6b7280; font-size: 14px;">
                                This link will expire in 1 hour. If you didn't request this, please ignore this email.
                            </p>
                        </div>
                        
                        <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #6b7280; font-size: 12px;">
                            If you're having trouble clicking the button, copy and paste this link into your browser:<br>
                            <span style="color: #2563eb;">${resetLink}</span>
                        </p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Password reset email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (password reset):', error.message);
            return null;
        }
    }

    // 12. Password Reset Success Email
    async sendPasswordResetSuccessEmail(email, username, ip, device) {
        try {
            const result = await this.brevo.transactionalEmails.sendTransacEmail({
                subject: '✅ Password Changed Successfully - Solzity',
                htmlContent: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="text-align: center; margin-bottom: 30px;">
                            <h1 style="color: #2563eb; font-size: 32px;">Solzity</h1>
                        </div>
                        
                        <h2 style="color: #2563eb;">Password Changed Successfully</h2>
                        <p>Hello ${username},</p>
                        <p>Your password has been changed successfully.</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                            <p><strong>IP Address:</strong> ${ip || 'Unknown'}</p>
                            <p><strong>Device:</strong> ${device || 'Unknown device'}</p>
                        </div>
                        
                        <div style="background: #fff3e6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; font-weight: bold;">⚠️ If this wasn't you:</p>
                            <ul style="margin-top: 10px;">
                                <li>Contact support immediately</li>
                                <li>Check your account activity</li>
                                <li>Enable 2FA if not already enabled</li>
                            </ul>
                        </div>

                        <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
                        <p style="color: #6b7280; font-size: 12px;">Stay safe!</p>
                    </div>
                `,
                sender: this.sender,
                to: [{ email, name: username }]
            });

            console.log(`✅ Password reset success email sent to ${email}`);
            return result;
        } catch (error) {
            console.error('❌ Brevo error (password reset success):', error.message);
            return null;
        }
    }
}

module.exports = new EmailService();

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Import email service
let emailService;
try {
    emailService = require('../services/emailService');
    console.log('✅ Email service loaded');
} catch (error) {
    console.log('⚠️ Email service not found - messages will be saved only');
}

// Simple in-memory storage
let contactMessages = [];

// Contact form submission
router.post('/', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        
        console.log('📝 Contact form received:', { name, email, subject });
        
        // Validate input
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }

        // Generate unique ID
        const id = uuidv4().substring(0, 8);
        const timestamp = new Date().toISOString();

        // Store in memory
        const newMessage = {
            id,
            name,
            email,
            subject,
            message,
            status: 'new',
            created_at: timestamp
        };
        
        contactMessages.unshift(newMessage);
        
        console.log(`✅ Message saved with ID: ${id}`);

        // SEND EMAIL TO USER
        let emailSent = false;
        
        if (emailService && emailService.transporter) {
            try {
                // Send confirmation email to user
                await emailService.transporter.sendMail({
                    from: '"Solzity Support" <support@cexplatform.com>',
                    to: email,
                    subject: `📬 We received your message - Ref: ${id}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h1 style="color: #2563eb; font-size: 28px;">Solzity</h1>
                            </div>
                            
                            <div style="background: white; padding: 30px; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                                <h2 style="color: #2563eb; margin-top: 0;">Thank you for contacting us, ${name}!</h2>
                                
                                <p style="color: #4b5563; line-height: 1.6;">We have received your message and will get back to you within 24 hours.</p>
                                
                                <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; margin: 20px 0;">
                                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #374151;">Your message:</p>
                                    <p style="margin: 0; color: #4b5563; font-style: italic;">"${message}"</p>
                                </div>
                                
                                <div style="background: #e6f7ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                    <p style="margin: 0; color: #0052cc;">
                                        <strong>Reference ID:</strong> ${id}
                                    </p>
                                </div>
                                
                                <p style="color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                                    While you wait, you might find answers in our 
                                    <a href="${process.env.BASE_URL || 'http://localhost:3000'}/support" style="color: #2563eb;">Support Center</a>.
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
                                <p>Solzity • Professional Trading with 100x Leverage</p>
                            </div>
                        </div>
                    `
                });
                
                emailSent = true;
                console.log(`✅ Confirmation email sent to ${email}`);
                
                // Also send notification to support team
                await emailService.transporter.sendMail({
                    from: '"Solzity Contact" <noreply@cexplatform.com>',
                    to: 'support@cexplatform.com',
                    subject: `New Contact: ${subject} - ${name}`,
                    html: `
                        <h2>New Contact Form Submission</h2>
                        <p><strong>ID:</strong> ${id}</p>
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Subject:</strong> ${subject}</p>
                        <p><strong>Message:</strong></p>
                        <p>${message.replace(/\n/g, '<br>')}</p>
                    `
                }).catch(e => console.log('Support notification failed:', e.message));
                
            } catch (emailError) {
                console.log('❌ Failed to send email:', emailError.message);
            }
        } else {
            console.log('⚠️ Email service not configured - no email sent');
        }

        // Return success with email status
        res.json({ 
            success: true, 
            message: 'Message sent successfully',
            reference: id,
            emailSent: emailSent,
            emailMessage: emailSent ? 'Confirmation email sent' : 'Message saved (email not configured)'
        });

    } catch (error) {
        console.error('❌ Contact form error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to send message' 
        });
    }
});

// Get all messages
router.get('/admin', (req, res) => {
    const auth = req.headers.authorization;
    
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({ 
        success: true, 
        data: contactMessages 
    });
});

module.exports = router;

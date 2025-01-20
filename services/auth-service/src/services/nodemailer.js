const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_ACCOUNT || 'collinsentrepreneur@gmail,com' ,
        pass: process.env.EMAIL_PASSWORD || 'ewpk ofve yoyo nhhn'
      }
    });
  }

  async sendVerificationCode(email, verificationCode) {
    if (!email || !verificationCode) {
      throw new Error('Email and verification code are required');
    }

    try {
      const mailOptions = {
        from: process.env.EMAIL_ACCOUNT,
        to: email,
        subject: "Admin Account Verification Code",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333; text-align: center;">Admin Verification Code</h2>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px;">
              <p style="font-size: 16px;">Your verification code is:</p>
              <h1 style="text-align: center; color: #4CAF50; letter-spacing: 5px;">${verificationCode}</h1>
              <p style="color: #666;">This code will expire in 15 minutes.</p>
              <p style="color: #999; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
            </div>
          </div>
        `
      };

      console.log('Attempting to send email to:', email);
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', {
        messageId: result.messageId,
        response: result.response
      });
      return true;

    } catch (error) {
      console.error('Email sending error:', {
        errorName: error.name,
        errorMessage: error.message
      });
      throw error;
    }
  }
}

module.exports = new EmailService();
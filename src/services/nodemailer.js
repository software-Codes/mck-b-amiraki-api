const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_ACCOUNT || "church.email@gmail.com",
        pass: process.env.EMAIL_PASSWORD || "app-specific-password", // Replace with app password
      },
    });
  }

  async sendVerificationCode(email, verificationCode) {
    if (!email || !verificationCode) {
      throw new Error("Email and verification code are required");
    }

    try {
      const mailOptions = {
        from: `"Bishop Amiraki Methodist Church" <${process.env.EMAIL_ACCOUNT}>`,
        to: email,
        subject: "Your Account Verification Code",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h1 style="text-align: center; color: #4CAF50;">Bishop Amiraki Methodist Church</h1>
            <p style="text-align: center; font-size: 18px; margin-bottom: 30px;">
              Welcome to Bishop Amiraki Methodist Church! Here is your account verification code.
            </p>
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; text-align: center;">
              <p style="font-size: 16px; margin-bottom: 10px;">Your verification code is:</p>
              <h2 style="color: #4CAF50; font-size: 36px; margin: 0; letter-spacing: 5px;">${verificationCode}</h2>
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                This code is valid for 15 minutes.
              </p>
            </div>
            <p style="font-size: 14px; color: #666; text-align: center; margin-top: 20px;">
              If you did not request this code, please ignore this email. For assistance, contact us at
              <a href="mailto:${process.env.EMAIL_ACCOUNT}" style="color: #4CAF50;">${process.env.EMAIL_ACCOUNT}</a>.
            </p>
            <footer style="margin-top: 30px; text-align: center; font-size: 12px; color: #999;">
              <p>Bishop Amiraki Methodist Church</p>
              <p>Bringing hope and spiritual guidance to the community.</p>
            </footer>
          </div>
        `,
      };

      console.log("Attempting to send email to:", email);
      const result = await this.transporter.sendMail(mailOptions);
      console.log("Email sent successfully:", {
        messageId: result.messageId,
        response: result.response,
      });
      return true;
    } catch (error) {
      console.error("Email sending error:", {
        errorName: error.name,
        errorMessage: error.message,
      });
      throw error;
    }
  }
}

module.exports = new EmailService();

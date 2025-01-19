const nodemailer = require("nodemailer");
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      secure: true,
      auth: {
        user: process.env.SMTP_FROM_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendVerificationCode(email, verificatioCode) {
    try {
      const mailOptions = {
        from: process.env.SMTP_FROM_EMAIL,
        to: email,
        subject: "Admin Account Verification Code",
        html: `
                <h2>Admin Verification Code</h2>
                <p>Your verification code is: <strong>${verificationCode}</strong></p>
                <p>This code will expire in 15 minutes.</p>
                <p>If you didn't request this code, please ignore this email.</p>
              `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log("Verification email sent successfully");
      return true;
    } catch (error) {
      console.error("Error sending verification email:", error);
      return false;
      throw new Error("Error sending verification email");
    }
  }
}
module.exports = new EmailService();

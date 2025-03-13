const nodemailer = require('nodemailer');
const { html } = require('common-tags');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_ACCOUNT || "collinsentrepreneur@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "ewpk ofve yoyo nhhn",
  },
});

const emailTemplates = {
  adminAlert: ({ suggestion, dashboardLink }) => ({
    subject: `🚨 New ${suggestion.urgency_level} priority suggestion!`,
    html: html`
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h3 style="color: #2c3e50;">New Suggestion Received</h3>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
          <p><strong>Category:</strong> ${suggestion.category}</p>
          <p><strong>Urgency:</strong> 
            <span style="color: ${
              suggestion.urgency_level === 'critical' ? '#e74c3c' : 
              suggestion.urgency_level === 'high' ? '#e67e22' : '#2ecc71'
            };">
              ${suggestion.urgency_level.toUpperCase()}
            </span>
          </p>
          <p><strong>Submitted by:</strong> 
            ${suggestion.is_anonymous ? 'Anonymous' : suggestion.user_name}
          </p>
          <hr style="border-color: #ddd;">
          <p>${suggestion.description}</p>
        </div>

        <div style="margin-top: 25px; text-align: center;">
          <a href="${dashboardLink}" 
             style="background: #3498db; color: white; 
                    padding: 12px 25px; border-radius: 5px; 
                    text-decoration: none;">
            View in Dashboard
          </a>
        </div>

        <p style="margin-top: 20px; color: #7f8c8d;">
          This is an automated notification. Please do not reply directly.
        </p>
      </div>
    `
  }),

  userConfirmation: ({ userName, suggestionId, timestamp }) => ({
    subject: "✅ Suggestion Received!",
    html: html`
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h3 style="color: #27ae60;">Thank you, ${userName}! for your suggestion to MCK Bishop Amiraki church  </h3>
        <p>We've received your suggestion and our team will review it shortly.</p>
        
        <div style="background: #ecf7ed; padding: 15px; border-radius: 8px;">
          <p><strong>Submission ID:</strong> ${suggestionId}</p>
          <p><strong>Received at:</strong> 
            ${new Date(timestamp).toLocaleString()}
          </p>
        </div>

        <p style="margin-top: 20px; color: #7f8c8d;">
          You'll receive another notification when your suggestion is reviewed.

          If you have any questions, feel free to reply to this email.
        </p>
      </div>
    `
  })
};

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

module.exports = {
  notifyAdmins: async ({ suggestion, adminEmails, dashboardLink }) => {
    try {
      if (!adminEmails || adminEmails.length === 0) {
        console.warn("No admin emails provided for notification");
        return;
      }

      const template = emailTemplates.adminAlert({ suggestion, dashboardLink });
      
      await transporter.sendMail({
        from: `Church App <${process.env.EMAIL_USER}>`,
        bcc: adminEmails.join(','),
        subject: template.subject,
        html: template.html,
        priority: suggestion.urgency_level === 'critical' ? 'high' : 'normal'
      });
    } catch (error) {
      console.error('Admin notification failed:', error);
      throw new Error('Failed to send admin notifications');
    }
  },

  notifyUser: async ({ userEmail, userName, suggestionId, timestamp }) => {
    try {
      if (!userEmail || !validateEmail(userEmail)) {
        console.error(`Invalid user email address: ${userEmail}`);
        throw new Error('Invalid user email address');
      }

      const template = emailTemplates.userConfirmation({ 
        userName, 
        suggestionId, 
        timestamp 
      });

      await transporter.sendMail({
        from: `Church App <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: template.subject,
        html: template.html
      });
    } catch (error) {
      console.error('User notification failed:', error);
      throw new Error('Failed to send user confirmation');
    }
  }
};
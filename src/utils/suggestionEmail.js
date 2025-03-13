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
    subject: `🚨 New ${suggestion.urgency_level} priority suggestion received from MCK Bishop Amiraki Church!`,
    html: html`
      <div style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #ffffff;">
        <!-- Header with Logo and Church Name -->
        <div style="background-color: #3498db; padding: 20px; text-align: center;">
          <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT8UQP4q2fVpayP0gCBGrYfPNFxOK4vJ8K81FBJNrA-WqR3SiZB6Y0Cv1F0X1x51vd3ISHO_w&s" 
               alt="MCK Bishop Amiraki Church Logo" 
               style="max-height: 60px; display: block; margin: 0 auto 10px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 28px;">MCK Bishop Amiraki Church</h1>
          <h2 style="color: #ffffff; margin: 5px 0 0; font-size: 20px;">New Suggestion Alert</h2>
        </div>
        
        <!-- Main Content -->
        <div style="padding: 20px;">
          <h2 style="color: #2c3e50; margin-bottom: 10px;">Suggestion Details</h2>
          
          <div style="background-color: #f0f8ff; padding: 15px; border: 1px solid #3498db; border-radius: 8px;">
            ${
              suggestion.title
                ? html`<p style="margin: 5px 0;"><strong>Title:</strong> ${suggestion.title}</p>`
                : ''
            }
            <p style="margin: 5px 0;"><strong>Category:</strong> ${suggestion.category}</p>
            <p style="margin: 5px 0;">
              <strong>Urgency:</strong>
              <span style="color: ${
                suggestion.urgency_level === 'critical'
                  ? '#e74c3c'
                  : suggestion.urgency_level === 'high'
                  ? '#e67e22'
                  : '#2ecc71'
              }; font-weight: bold;">
                ${suggestion.urgency_level.toUpperCase()}
              </span>
            </p>
            <p style="margin: 5px 0;"><strong>Submitted by:</strong> ${suggestion.is_anonymous ? 'Anonymous' : suggestion.user_name}</p>
            ${
              suggestion.submittedAt
                ? html`<p style="margin: 5px 0;"><strong>Submitted On:</strong> ${new Date(suggestion.submittedAt).toLocaleString()}</p>`
                : ''
            }
            <hr style="border: none; border-top: 1px solid #3498db; margin: 15px 0;">
            <p style="line-height: 1.6; margin: 5px 0;">${suggestion.description}</p>
          </div>

        
        <!-- Footer -->
        <div style="padding: 20px; text-align: center; background-color: #f8f9fa;">
          <p style="color: #7f8c8d; font-size: 12px; margin: 0;">
            This is an automated notification from MCK Bishop Amiraki Church. Please do not reply directly.
          </p>
        </div>
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


const dotenv = require('dotenv')
const createApp = require('./app.js')

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    const { app, server, initialize } = createApp();
    await initialize();

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);

    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
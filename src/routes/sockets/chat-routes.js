const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middleware/authMiddleware");
const chatController = require("../../controllers/socket/ChatController");
const socketService = require("../../services/SocketService");
// Initialize the Chat controller with socket service
// router.get("/conversations", authMiddleware, (req, res) =>
//   chatController.getConversationHistory);
// router.get("/conversations/:id/messages", authMiddleware, (req, res) =>
//   chatController.getConversationHistory(req, res)
// );
// router.post("/messages", authMiddleware, (req, res) =>
//   chatController.sendMessage(req, res)
// );
// router.get("/messages/unread", authMiddleware, (req, res) =>
//   chatController.getUnreadMessageCount(req, res)
// );
// router.get("/contacts", authMiddleware, (req, res) =>
//   chatController.getContacts(req, res)

exports.default = router;


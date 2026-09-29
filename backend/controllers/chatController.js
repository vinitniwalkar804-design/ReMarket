import mongoose from "mongoose";
import { User, Product, Chat } from "../models/index.js";
import { recordEvent } from "../services/behaviorEvents.js";
const isObjectId = (value) => mongoose.isValidObjectId(String(value || ""));
const requestError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const getChats = async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .sort({ lastMessageAt: -1 })
      .populate("participants", "name avatar")
      .populate("productId", "title price images");
    res.json({ chats });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getChat = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid chat" });
    const chat = await Chat.findById(req.params.id)
      .populate("participants", "name avatar")
      .populate("productId", "title price images");
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!chat.participants.some((participant) => String(participant._id) === String(req.user._id))) {
      return res.status(403).json({ message: "Not authorized" });
    }
    chat.messages.forEach((message) => {
      if (String(message.senderId) !== String(req.user._id)) message.read = true;
    });
    await chat.save();
    res.json({ chat });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const createChat = async (req, res) => {
  try {
    const { otherUserId, productId } = req.body;
    const text = String(req.body.text || "").trim().slice(0, 2000);
    if (!isObjectId(otherUserId) || String(otherUserId) === String(req.user._id)) throw requestError("Choose another marketplace member");
    if (productId && !isObjectId(productId)) throw requestError("Invalid product");
    if (productId) {
      const product = await Product.findById(productId).select("seller");
      if (!product) return res.status(404).json({ message: "Product not found" });
      if (String(product.seller) !== String(otherUserId)) return res.status(400).json({ message: "Chat must be with the product seller" });
    } else {
      const otherUser = await User.findById(otherUserId).select("_id");
      if (!otherUser) return res.status(404).json({ message: "User not found" });
    }
    let chat = await Chat.findOne({
      participants: { $all: [req.user._id, otherUserId] },
      ...(productId ? { productId } : {}),
    });
    if (!chat) {
      chat = await Chat.create({
        participants: [req.user._id, otherUserId],
        productId: productId || null,
        messages: [],
      });
      await recordEvent(req, {
        userId: req.user._id,
        eventType: "CHAT_STARTED",
        productId: productId || null,
        metadata: { otherUserId },
      });
    }
    if (text) {
      chat.messages.push({ senderId: req.user._id, text, timestamp: new Date() });
      chat.lastMessage = text;
      chat.lastMessageAt = new Date();
      await chat.save();
    }
    res.status(201).json({ chatId: chat._id });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message || "Chat could not be created" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid chat" });
    const text = String(req.body.text || "").trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: "Message cannot be empty" });
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!chat.participants.some((participant) => String(participant) === String(req.user._id))) {
      return res.status(403).json({ message: "Not authorized" });
    }
    chat.messages.push({ senderId: req.user._id, text, timestamp: new Date() });
    chat.lastMessage = text;
    chat.lastMessageAt = new Date();
    await chat.save();
    res.json({ chat });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

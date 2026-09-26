import { Notification } from "../models/index.js";

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    const unread = notifications.filter((n) => !n.read).length;
    res.json({ notifications, unreadCount: unread });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const markRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
    res.json({ message: "All marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
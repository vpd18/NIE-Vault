-- Notifications table for persistent inbox + email-triggered events
-- Run this on your MySQL database once.

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(255) DEFAULT NULL,
  data_json LONGTEXT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_notifications_user_read (user_id, is_read),
  INDEX idx_notifications_user_created (user_id, created_at)
);

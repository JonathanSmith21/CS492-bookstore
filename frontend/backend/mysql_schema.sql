-- MySQL schema for Customer Store
-- Creates `bookstore` database and `users` table used by the backend

CREATE DATABASE IF NOT EXISTS bookstore CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE bookstore;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'user',
  mfa_enabled TINYINT(1) NOT NULL DEFAULT 0,
  mfa_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example: create an admin user (replace HASH with bcrypt hash)
-- INSERT INTO users (username,password_hash,role,mfa_enabled) VALUES ('admin','<HASH>','admin',0);

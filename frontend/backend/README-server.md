# Bookstore Management System (BMS) - Backend

## Overview

This is a Node.js/Express backend that provides secure API endpoints for the BMS frontend application. It includes authentication, role-based access control (RBAC), inventory management, shopping cart operations, order processing, and daily sales reporting.

**Database:** lowdb (pure JavaScript JSON storage - no native dependencies)  
**Port:** 3001 (HTTP by default, HTTPS with certificate configuration)

---

## Features

### Authentication & Security
- **Password Hashing:** bcrypt (cost factor 10)
- **Session Tokens:** JWT (7-day expiry by default)
- **Two-Factor Authentication (MFA):** TOTP via speakeasy + QR code generation
- **Rate Limiting:** 20 requests per 60 seconds on auth endpoints
- **CORS Support:** Configured for frontend requests
- **Security Headers:** Helmet.js middleware

### Role-Based Access Control (RBAC)
- **Admin Role:** Full inventory management, view all orders, generate reports
- **User Role:** Browse inventory, manage personal cart, place orders, view own orders

### Core Features
- **Inventory Management:** CRUD operations for books (admin only)
- **Shopping Cart:** Persistent per-user cart storage
- **Order Processing:** Checkout with automatic inventory decrement
- **Order History:** View personal order details with line items
- **Daily Reports:** Sales analytics with top-selling books, CSV export
- **Supplier Integration:** Bulk update inventory from supplier feed

---

## Project Structure

```
frontend/backend/
├── server.js              # Express server with all API endpoints
├── package.json           # Dependencies and npm scripts
├── bms.json              # JSON database (created on first run)
├── README-server.md      # This file
└── node_modules/         # Installed dependencies (after npm install)
```

---

## Database Schema (bms.json)

The database is a single JSON file 

## API Endpoints

### Authentication

**POST /api/register**
- Register new user account
- Body: `{username, password}`
- Returns: `{ok, user, token}`

**POST /api/login**
- Login with username/password (and optional TOTP)
- Body: `{username, password, totp?}`
- Returns: `{ok, user, token}`

**POST /api/mfa/setup** (requires auth)
- Generate TOTP secret and QR code
- Returns: `{ok, secret, qr}` (base32 secret and data URL)

## Setup & Installation

### Prerequisites
- Node.js 14+ 
- npm

### Installation

```powershell
cd frontend/backend
npm install
```

This will install all dependencies

### Running the Server

```powershell
cd frontend/backend; npm start
#this will start the server
```

## Default Admin User

When the database is first created, an admin user is seeded:

```
Username: admin
Password: adminpass 
Role: admin
```


## HTTPS Support

To enable HTTPS, provide SSL certificates:

```powershell
$env:SSL_KEY_PATH = "./certs/key.pem"
$env:SSL_CERT_PATH = "./certs/cert.pem"
npm start
```

The server will automatically detect and use HTTPS if both paths exist.


## Authentication Flow

### Login
1. User submits username/password
2. Server finds user, hashes submitted password, compares with stored hash
3. If password valid and no MFA: return JWT token
4. If password valid and MFA enabled: require TOTP token before returning JWT

## Inventory Seeding

On first run, the database is seeded with 4 sample books:
(you can change these to whatever you want)

To add more books, use the **POST /api/inventory** endpoint (admin only).


## Integration with Frontend

The frontend (`frontend/app.js`) communicates with this backend:

1. Detects backend availability via `/api/health` health check
2. If backend available: uses API endpoints for all operations
3. If backend unavailable: falls back to localStorage and `users.json`







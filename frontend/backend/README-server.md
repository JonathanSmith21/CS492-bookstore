Backend (optional)
------------------

This project includes an optional Node/Express backend that provides:
- Password hashing (bcrypt)
- TOTP-based MFA setup/confirm (speakeasy + QR code)
- Role-based access control (RBAC) with `user` and `admin` roles
- JWT session tokens
- HTTPS-ready startup (provide `SSL_KEY_PATH` and `SSL_CERT_PATH` in `.env`)

Files:
- `server.js` — Express server with endpoints for register/login/mfa and admin user management.
- `package.json` — dependencies and scripts.
- `mysql_schema.sql` — SQL to create `bookstore` DB and `users` table.

Environment variables (create `.env` in `customer_store`):

```
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=bookstore
PORT=3001
JWT_SECRET=replace-this-in-prod
# Optional for HTTPS
SSL_KEY_PATH=./certs/key.pem
SSL_CERT_PATH=./certs/cert.pem
```

Install and run:

```powershell
cd customer_store
npm install
npm start
```

Notes and safety:
- The server is intentionally minimal for local development. For production you should:
  - Use strong JWT secrets and rotate them.
  - Use HTTPS with valid certificates (or place behind a reverse proxy with TLS).
  - Add input validation and better error handling.
  - Protect admin endpoints behind stronger auth and auditing.

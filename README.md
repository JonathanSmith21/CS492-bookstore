Bookstore Management System
Full-Stack Application with Authentication, MFA, Role-Based Access, Inventory CRUD, and Supplier Sync

Backend: Node.js + ExpressFrontend: HTML / CSS / JavaScriptSecurity Features: Password hashing, sessions, MFA, RBAC, HTTPS-ready
CS492_GP2.ZIP/
│
├── server.js           # Express web server
├── db.js               # In-memory database + role definitions
├── auth.js             # Authentication routes, MFA logic
├── rbac.js             # Role-based access middleware
│
├── package.json        # Dependencies + npm scripts
│
└── public/
    ├── index.html      # Front-end UI
    ├── app.js          # Client-side JS logic
    ├── styles.css      # Page styling

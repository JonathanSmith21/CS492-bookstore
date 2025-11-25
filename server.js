const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

const fs = require('fs');
// users persisted to users.json for demo
const usersFile = path.join(__dirname, 'users.json');

function loadUsers(){
  try{
    if(fs.existsSync(usersFile)){
      const raw = fs.readFileSync(usersFile, 'utf8');
      return JSON.parse(raw);
    }
  }catch(e){ console.error('Failed loading users.json', e); }
  // default admin user if no file
  return {
    admin: { username: 'admin', display: 'Administrator', passwordHash: bcrypt.hashSync('password', 10) }
  };
}

function saveUsers(users){
  try{
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), { encoding: 'utf8' });
    return true;
  }catch(e){ console.error('Failed saving users.json', e); return false; }
}

// load or create users
const users = loadUsers();
// ensure users.json exists
saveUsers(users);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// Serve static frontend
const staticDir = path.join(__dirname, 'bookstore-app');
app.use(express.static(staticDir));

// API: login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const user = users[username];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  // store minimal session
  req.session.user = { username: user.username, display: user.display };
  return res.json({ ok: true, user: req.session.user });
});

// API: register
app.post('/api/register', (req, res) => {
  const { username, password, display } = req.body || {};
  if(!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  const uname = String(username).trim();
  if(!/^[A-Za-z0-9_\-]{3,32}$/.test(uname)){
    return res.status(400).json({ error: 'Username must be 3-32 chars and contain only letters, numbers, - or _' });
  }
  if(users[uname]) return res.status(409).json({ error: 'Username already exists' });
  const hashed = bcrypt.hashSync(String(password), 10);
  users[uname] = { username: uname, display: display ? String(display) : uname, passwordHash: hashed };
  const ok = saveUsers(users);
  if(!ok) return res.status(500).json({ error: 'Unable to save user' });
  return res.json({ ok: true, user: { username: uname, display: users[uname].display } });
});

// API: logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Unable to logout' });
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

// API: session info
app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ user: req.session.user });
  }
  return res.json({ user: null });
});

// Example protected API
app.get('/api/protected', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ message: `Hello ${req.session.user.display}, this is protected data.` });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Serving static files from ${staticDir}`);
});

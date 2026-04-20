require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const domainRoutes = require('./routes/domainRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: false,
    }),
    name: 'dnsblock.sid',
    secret: process.env.SESSION_SECRET || 'dnsblock-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);
const { hasPermission } = require('./middlewares/auth');

app.use((req, res, next) => {
  res.locals.hasPermission = (permission) => hasPermission(req.session.user, permission);
  next();
});

app.use(authRoutes);
app.use(domainRoutes);

app.use((req, res) => {
  return res.status(404).send('Página não encontrada.');
});

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`DNSBlock rodando em http://localhost:${port}`);
});

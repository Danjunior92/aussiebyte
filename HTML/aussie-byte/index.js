// index.js
// Small Express + SQLite blog example
// This file wires up an Express app, opens a SQLite DB, ensures tables exist,
// and defines routes for listing, creating, editing, deleting posts and adding comments.

// ----- Modules -----
// express: lightweight web framework that provides routing and middleware
const express = require('express');
// sqlite3: embedded SQL database. Using the verbose() helper gives improved stack traces.
const sqlite3 = require('sqlite3').verbose();
// Exress session middleware for managing user admin login
const session = require('express-session');

// ----- App + config -----
const app = express();
const port = 3000; // change this if you want a different port

// Configure EJS as the view engine so we can render .ejs templates from /views
app.set('view engine', 'ejs');

// ADMIN LOGIN SESSION MANAGEMENT
// Middleware: session management for user authentication
app.use (express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret:'2408201608051995',
  resave: false,
  saveUninitialized: false
}));
// This middleware makes the 'user' variable available in all EJS templates.
app.use((req, res, next) => {
    if (req.session && req.session.userId) {
        res.locals.user = { id: req.session.userId };
    } else {
        res.locals.user = null;
    }
    next();
});

// ----- Error handling -----
// Catch uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
    process.exit(1); // Exit the process to avoid running in an unstable state
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
    process.exit(1); // Exit the process to avoid running in an unstable state
});

// Log normal exit and OS signals so we can see why the process stopped.
process.on('exit', (code) => {
  console.log(`Process exit event with code: ${code}`);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT (Ctrl+C). Exiting.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Exiting.');
  process.exit(0);
});

// ----- Database connection -----
// Opens (or creates) a local file named blog.db with read/write permissions.
// The callback logs connection errors (if any).
const db = new sqlite3.Database(
  './blog.db',
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      // Log DB open errors to the console. Returning avoids continuing with an invalid DB.
      return console.error(err.message);
    }
    console.log('Connected to the blog database.');
  }
);

// -- IMPORT ROUTER (AFTER DB CONNECTION) --
const authRoutes = require('./routes/auth.js')(db);
app.use(authRoutes);

// -- AUTHENTICATION ROUTES --
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) {
    return next(); // User is logged in, continue to the next middleware/route
  } else {
    return res.redirect('/login'); // Redirect to login page if not authenticated
  }
}  

// db.serialize ensures the following commands run in order. This is important
// when we create tables and then insert seed data — we want the CREATE to finish first.
db.serialize(() => {

  // Create a users table if it doesn't already exist.
  // id is an auto-incrementing primary key. username is unique and required.
  // password is hashed using bcrypt, so we store it as TEXT.
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    )`
  , (err) => {
    if (err) console.error('Error creating users table:', err.message);
  });
  // Create a posts table if it doesn't already exist
  // id is an auto-incrementing primary key. title/content are required text fields.
  db.run(
    `CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  , (err) => {
    if (err) console.error('Error creating posts table:', err.message);
  });

  // Create comments table with timestamps
  db.run(
    `CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      rating INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id)
    )`
  , (err) => {
    if (err) console.error('Error creating comments table:', err.message);
  });


  // GET /post/edit/:id
  // Renders an edit form for a single post. The template expects a `post` object.
  app.get('/post/edit/:id', (req, res) => {
    const id = req.params.id; // route parameter from URL
    const sql = 'SELECT * FROM posts WHERE id = ?';

    // db.get fetches a single row (first match). Parameterized SQL (using `?`) prevents SQL injection.
    db.get(sql, [id], (err, row) => {
      if (err) return console.error(err.message);

      if (row) {
        // Render the edit-post.ejs view and pass the `post` object
        res.render('edit-post', { post: row });
      } else {
        res.status(404).send('Post not found');
      }
    });
  });

  // POST /post/edit/:id
  // Handles the submitted edit form and updates the DB, then redirects back to the post.
  app.post('/post/edit/:id', (req, res) => {
    const id = req.params.id;
    const { title, content } = req.body; // coming from the form fields
    const sql = 'UPDATE posts SET title = ?, content = ? WHERE id = ?';

    // db.run executes the UPDATE; the callback reports errors (if any).
    db.run(sql, [title, content, id], (err) => {
      if (err) return console.error(err.message);
      // On success, redirect to the post page (GET /post/:id)
      res.redirect('/post/' + id);
    });
  });

  // GET /
  // Homepage: list all posts in descending order (newest first).
  app.get('/', (req, res) => {
    const sql = `SELECT * FROM posts ORDER BY id DESC`;

    // db.all returns all rows matching the query as an array.
    db.all(sql, [], (err, rows) => {
      if (err) return console.error(err.message);
      // Render the home.ejs template and pass the posts array (as `posts`).
      res.render('home', { posts: rows });
    });
  });

  // GET /new-post
  // Renders a form to create a new post. The form submits to POST /new-post.
  app.get('/new-post', requireLogin, (req, res) => {
    res.render('new-post');
  });

  // GET /post/:id
  // Display a single post and its comments. We query the post then its comments.
  app.get('/post/:id', (req, res) => {
    const id = req.params.id;
    const postSql = `SELECT * FROM posts WHERE id = ?`;
    const commentSQL = `SELECT * FROM comments WHERE post_id = ? ORDER BY id DESC`;

    // First fetch the post row
    db.get(postSql, [id], (err, row) => {
      if (err) return console.error(err.message);

      if (row) {
        // If the post exists, fetch comments for that post and then render the view.
        db.all(commentSQL, [id], (err, comments) => {
          if (err) return console.error(err.message);
          // Render the post view, passing the single `post` object and `comments` array
          res.render('post', { post: row, comments: comments });
        });
      } else {
        res.status(404).send('Post not found');
      }
    });
  });

  // POST /new-post
  // Handles creation of a new post from the form. Redirects to the homepage on success.
  app.post('/new-post', (req, res) => {
    const { title, content } = req.body;
    const sql = `INSERT INTO posts (title, content) VALUES (?, ?)`;

    db.run(sql, [title, content], (err) => {
      if (err) return console.error(err.message);
      res.redirect('/');
    });
  });

  // POST /post/delete/:id
  // Deletes a post and redirects to the homepage. Note: no confirmation here — the form should handle that.
  app.post('/post/delete/:id', requireLogin, (req, res) => {
    const id = req.params.id;
    const sql = `DELETE FROM posts WHERE id = ?`;

    db.run(sql, [id], (err) => {
      if (err) return console.error(err.message);
      res.redirect('/');
    });
  });

  // POST /post/:id/comment
  // Inserts a new comment for the specified post then redirects back to that post.
  app.post('/post/:id/comment', (req, res) => {
    const postId = req.params.id;
    const { author, content, rating } = req.body;
    const sql = `INSERT INTO comments (post_id, author, content, rating) VALUES (?, ?, ?, ?)`;

    db.run(sql, [postId, author, content, rating], (err) => {
      if (err) return console.error(err.message);
      res.redirect(`/post/${postId}`);
    });
  });

  // Start the server only after DB setup completes
  // Express-level error handler (final middleware) - logs and returns 500
  app.use((err, req, res, next) => {
    console.error('Express error handler:', err && err.stack ? err.stack : err);
    if (res.headersSent) return next(err);
    res.status(500).send('Internal Server Error');
  });

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
});
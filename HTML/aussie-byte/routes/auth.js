// routes/auth.js

// --- IMPORTS ---
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router(); // Initialize Express Router

// This router needs access to the database. We will pass the 'db' object from index.js.
module.exports = function(db) {

    // --- AUTHENTICATION ROUTES ---

    // Route to display the registration form.
    router.get('/register', (req, res) => {
        res.render('register');
    });

    // Route to handle the registration form submission.
    router.post('/register', (req, res) => {
        const { username, password } = req.body;
        const saltRounds = 10;

        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) { return console.error(err.message); }
            const sql = `INSERT INTO users (username, password) VALUES (?, ?)`;
            db.run(sql, [username, hash], (err) => {
                if (err) { return console.error(err.message); }
                res.redirect('/login');
            });
        });
    });

    // Route to display the login form.
    router.get('/login', (req, res) => {
        res.render('login', { error: null });
    });

    // Route to handle the login form submission.
    router.post('/login', (req, res) => {
        const { username, password } = req.body;
        const sql = `SELECT * FROM users WHERE username = ?`;

        db.get(sql, [username], (err, user) => {
            if (err) { return console.error(err.message); }
            if (!user) { return res.render('login', { error: 'Invalid username or password' }); }

            bcrypt.compare(password, user.password, (err, result) => {
                if (result) {
                    req.session.userId = user.id;
                    res.redirect('/');
                } else {
                    res.render('login', { error: 'Invalid username or password' });
                }
            });
        });
    });

    // Route to handle logging out.
    router.get('/logout', (req, res) => {
        req.session.destroy(err => {
            if (err) { return res.redirect('/'); }
            res.clearCookie('connect.sid');
            res.redirect('/login');
        });
    });

    // Return the configured router
    return router;
};
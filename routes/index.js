const express = require('express');
const router = express.Router();



router.get('/', (req, res, next) => {
    res.render('index');
});

router.get('/target', (req, res, next) => {
    res.render('target');
});

router.get('/posts', (req, res, next) => {
    res.render('posts');
});

router.get('/chatbot', (req, res, next) => {
    res.render('chatbot');
});

module.exports = router;
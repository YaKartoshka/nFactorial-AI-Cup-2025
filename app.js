require('dotenv').config()
var express = require('express');
var fs = require('fs');
var path = require('path');
var bodyParser = require('body-parser');
var session = require('express-session');
var app = express();


// -------- routes --------
var index = require('./routes/index');
var instagram = require('./routes/instagram');
var integrations = require('./routes/integrations');
var webhook = require('./routes/webhook');



//html ejs
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');


// -- used packages --
app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));

app.use("/js", express.static(__dirname + "/public/js", {maxAge: 3600000}));
app.use("/public", express.static(__dirname + "/public", {maxAge: 3600000}));
app.set("trust proxy", true);
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: "nfact1234",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 60 * 24 * 60 * 60 * 1000,
        secure: run_mode ? false : true, 
    }
}));


// -- routes --
app.use('/', index);
app.use('/instagram', instagram);  
app.use('/integrfunc', integrations);  
app.use('/webhook', webhook);  


app.use((req, res, next) => {
    res.status(404).render('error')
});

module.exports = app;


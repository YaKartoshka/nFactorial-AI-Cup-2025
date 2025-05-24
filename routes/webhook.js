const express = require('express');
const router = express.Router();
const async = require('async');
const request = require('request');


router.get('/instagram', function (req, res, next) {
    console.log("fbwebhook instagram GET testing");
    if (req.query['hub.mode'] && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] == '12345') {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});


router.post('/instagram', async function (req, res, next) {
    var messaging_events = req.body.entry[0].messaging;
    for (var i = 0; i < messaging_events.length; i++) {
        var event = req.body.entry[0].messaging[i];
        var sender = event.sender.id, recipient = event.recipient.id, is_echo = (event.message ? event.message.is_echo : null);
        if (!is_echo)
            request.post({ url: 'https://parent.coachmate.kz/instagram', form: { 'event': event } }, function (error, response, body) {
                if (error) console.error("instagram1_webhook.err1:", error);
            });
    }
    res.sendStatus(200);
});



module.exports = router;
var express = require('express');
var router = express.Router();
var fs = require('fs');
const request = require('request'); 
const async = require('async');
const integr = require('../libs/integrations.js');
const path = require('path');
const instaProfilePath = path.join(__dirname, '..', 'insta_profile.json');
const instaDataPath = path.join(__dirname, '..', 'insta_data.json');
const instaMenuPath = path.join(__dirname, '..', 'insta_menu.json');
const insta_chats = path.join(__dirname, '..', 'insta_chats.json');

router.get('/', function(req, res, next){
  try{
    res.header("Content-Type", "application/json; charset=utf-8");  
    console.log('/integrations', req.query.action);
    var action = req.query.action, r = {r:200};
 
    console.log(action)

    if (action == 'getInstagramInfo') {
      const r = {};
      const data = readInstagramData();

      const access_token = data.instagram_token || null;

      integr.instagram_getUserData(access_token, function(user_id, username) {
        r['user_id'] = user_id || "";
        r['username'] = username || "";
        r['status'] = data.instagram_status || null;
        r['expires_at'] = data.instagram_token_expires_at || null;
        res.send(JSON.stringify(r));
      });
    }
  } catch(ex){console.log("ERR->integrfunc="+ex);}
});






function readInstagramData() {
  if (!fs.existsSync(instaProfilePath)) return {};
  return JSON.parse(fs.readFileSync(instaProfilePath, 'utf8'));
}



module.exports = router;
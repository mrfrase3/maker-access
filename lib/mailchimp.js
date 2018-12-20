const config = require('../config.json');
const request = require('request');
const crypto = require('crypto');

class MailChimp {
	constructor(app, usersdb, logsdb, perms){
    	this.app = app;
    	this.usersdb = usersdb;
    	this.logsbd = logsdb;
    	this.perms = perms;
    	app.post(config.mailchimp.webhook, this.webhook);
    	let splitkey = config.mailchimp.apikey.split('-');
    	if(splitkey.length !== 2) return console.error("Invalid mailchimp api key provided");
    	this.url = `https://${splitkey[1]}.api.mailchimp.com/3.0/`;
    
    	setInterval(this.syncsubs, 24*60*60*1000);
    	this.syncsubs();
    }

	webhook(req, res){
    	var list;
    	for(let i in config.mailchimp.listIDs){
        	if(req.body.data.list_id == config.mailchimp.listIDs){
            	list = i;
            	break;
            }
        }
    	if(!list) return;
    	if(req.body.type === 'unsubscribe'){
        	this.usersdb.findOne({$or: [{mail: req.body.data.email}, {prefmail: req.body.data.email}]}, (err, user) => {
            	if(err) return console.error(err);
            	if(!user) return;
            	this.perms.toggle( user.username, config.mailchimp.subPerms[list]);
            });
        }
    	res.json({success: true});
    	logsdb.insertOne({action: "mailchimp.webhook", time: new Date(), details: req.body});
    }

	subscribe(username, list="makers", cb){
    	if(!this.url) return;
    	if(!cb) cb = function(err){};
    	this.usersdb.findOne({username}, (err, user) => {
        	if(err) return console.error(err) + cb(err);
        	request.post(this.url + `lists/${config.mailchimp.listIDs[list]}/members`, {json: true, body:{
    			"email_address": user.prefmail || user.mail,
    			"status": "subscribed",
    			"merge_fields": {
                	"NAME" : user.firstname || user.fullname,
                	"FULLNAME": user.fullname,
        			"FNAME": user.firstname || user.fullname,
        			"LNAME": user.surname || ""
    			}
            }}, (err, res, body) => {
            	if(err) return console.error(err) + cb(err);
            	if(!res || res.statusCode !== 200){
                	if(res.statusCode !== 400 || body.title != "Member Exists"){
                		err = 'subscribe failed, res: '+JSON.stringify(res)+' body: '+JSON.stringify(body);
                		return console.error(err) + cb(err);
                    }
                }
            	this.perms.add(username, config.mailchimp.subPerms[list], success => {
                	if(!success) return console.error('could not add permission') + cb('could not add permission');
                	cb(null);
                });
            }).auth('anystring', config.mailchimp.apikey);
        });
    }

	syncsubs(){
    	/*this.usersdb.find().each((err, user) => {
        	if(err) return console.error(err);
        	let md5mail = crypto.createHash('md5').update(user.prefmail || user.mail).digest("hex"){}
        });*/
    	var getmemes = (offset, count, total) => {
    	request.get(this.url + `lists/${config.mailchimp.listIDs.makers}/members`, 
        {json: true, qs: {count, offset, fields: ["email_address", "status"]}, auth: {user: 'anystring', pass: config.mailchimp.apikey}}, 
        (err, res, body)=>{
        	if(err) return console.error(err);
        	if(!res || res.statusCode !== 200){
                return console.error(`subscribe failed, res: ${res} body: ${body}`);
            }
        	//console.log(body.members[0].email_address);
        	body.members.forEach(member => {
            	this.usersdb.findOne({$or: [{mail: member.email_address}, {prefmail: member.email_address}]}, (err, user) => {
                	if(err) return console.error(err);
            		if(!user) return;
            		this.perms.has( user.username, config.mailchimp.subPerms.makers, has =>{
                    	let sub = member.status == 'subscribed';
                    	if((has && sub) || (!has && !sub)) return;
                    	if(has && !sub) this.perms.remove( user.username, config.mailchimp.subPerms.makers);
                    	if(!has && sub) this.perms.add( user.username, config.mailchimp.subPerms.makers);
                    });
            	});
            });
        	if(total === -1) total = body.total_items;
        	if(offset + count < total) getmemes(offset+count, count, total);
        });
        };
    	getmemes(0, 10, -1);
    }
}

module.exports = MailChimp;
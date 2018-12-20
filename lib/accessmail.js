var nodemailer = require('nodemailer');
var Handlebars = require('handlebars');
var config = require('../config.json');
var fs = require('fs');
var logs;
var users;
var perms;

// create reusable transporter object using the default SMTP transport
var transporter = nodemailer.createTransport(config.smtp);

var sendMail = function(mailOptions){
	// send mail with defined transport object
	transporter.sendMail(mailOptions, function(error, info){
	    if (error) {
	        return console.error(error);
	    }
	    console.log('Message %s sent: %s', info.messageId, info.response);
	});
}

var checkTraining = function(){
	var training = JSON.parse(fs.readFileSync('./training.json'));
	var now = new Date();
	training.forEach(function(course){
    	if(!course.accessmail) return;
    	if(!Array.isArray(course.accessmail)) course.accessmail = [course.accessmail];
    	course.accessmail.forEach(function(accessmail, index){
        	accessmail.days = accessmail.days || [1];
        	accessmail.hour = accessmail.hour || 12;
        	if(
        	    accessmail.sendon === "weekly" && 
        	    (
        	        accessmail.days.indexOf(now.getDay()) === -1 ||
        	        accessmail.hour !== now.getHours()
        	    ) 
        	) return;
        	logs.findOne({action: "accessmail."+course.label+"."+index}, {sort: {time: -1}}, function(err, log){
        	    if(err) return console.error(err);
        	    if(!log) log = {action: 'accessmail.'+course.label+"."+index, details: {}, time: 0};
        	    log.time = new Date(log.time);
        	    if(accessmail.sendon === 'weekly' && Date.now() - log.time.getTime() < 24*60*60*1000) return;
        	    perms.find({perm: {$in: course.perms}, added: {$gt: log.time}, enabled: true}).toArray(function(err, ps){
        	        if(err) return console.error(err);
        	        // console.log(ps);
        	        if(ps.length < 1) return;
        	        var usernames = [];
        	        for(var i in ps){
        	            usernames.push(ps[i].username);
        	            //console.log(ps[i].username);
        	        }
        	        console.log(usernames);
        	        var sender = function(doorusers){
        	            if(doorusers.length < 1) return;
                    	for(var i in doorusers) if(!doorusers[i].prefmail) doorusers[i].prefmail = doorusers[i].mail;
        	            var email = Object.assign({}, accessmail.email);
						var template;
						var filldata = {users: doorusers, user: doorusers[0]};
        	            if(email.text){
        	                template = Handlebars.compile(email.text);
        	                email.text = template(filldata);
        	            }
        	            if(email.html){
        	                template = Handlebars.compile(email.html);
        	                email.html = template(filldata);
        	            }
        	            if(!email.text && !email.html) email.text = "No message written";
        	            if(email.to){
							if(!Array.isArray(email.to)) email.to = [email.to];
        	                email.to = email.to.map(v=>Handlebars.compile(v)(filldata));
        	            }
        	            if(email.cc){
							if(!Array.isArray(email.cc)) email.cc = [email.cc];
        	                email.cc = email.cc.map(v=>Handlebars.compile(v)(filldata));
        	            }
        	            if(email.bcc){
							if(!Array.isArray(email.bcc)) email.bcc = [email.bcc];
        	                email.bcc = email.bcc.map(v=>Handlebars.compile(v)(filldata));
        	            }
        	            sendMail(email);
        	            logs.insertOne({action: "accessmail."+course.label+"."+index, details: {users: doorusers, training: course.label}, time: new Date()});
        	        };
                	users.find({username: {$in: usernames}}).toArray(function(err, doorusers){
        	            if(err) return console.error(err);
                    	if(accessmail.type === 'group'){
                        	sender(doorusers);
                        } else if(accessmail.type === 'individual') {
                        	doorusers.forEach(function(dooruser){sender([dooruser]);});
                        }
                    });
        	    });
        	});
        });
    });
}

module.exports = function(u, l, p){
	users = u;
	logs = l;
	perms = p;
	return checkTraining;
}

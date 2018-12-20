// initiate packages
/*eslint-env node */
var path = require("path");
var fs = require("fs");
var config = require("./config.json");
var request = require("request");
var express = require("express");
var session = require("express-session");
var crypto = require('crypto');
//var fstore = require("session-file-store")(session);
var MongoStore = require('connect-mongo/es5')(session);
var app = express();
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var database, usersdb, tagsdb, permsdb, logsdb, tokensdb;
var perms, mailchimp;

var check_user_training = require("./lib/check_user_training.js");
var validate_training_config = require("./lib/validateTrainingConfig.js");
// get the SSL keys, change to location of your certificates
var server;
var re_server;
if(config.https.enabled){
	var keys = {key: fs.readFileSync(config.https.key, "utf8"), cert: fs.readFileSync(config.https.cert, "utf8")};
	server = require("https").createServer(keys, app);
	if(config.http.enabled){
		re_server = require('http').createServer(function(req, res){
    		res.writeHead(302, {'Location': 'https://'+ (req.hostname || "access.makeuwa.com") + req.url});
			res.end();
    	});
    }
} else {
	server = require("http").createServer(app);
}
var io = require("socket.io")(server);
var bodyParser = require("body-parser");
var helmet = require("helmet");
var userTokens = {};

// token generator, pretty random, but can be replaced if someone has something stronger
var token = function() {
	return (Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2)).replace(/\W/g, "t");
};

var templates = {};
var getTemplates = function(){
	fs.readdir(__dirname + '/templates/', function(err, files){
    	if(err) return console.error(err);
		files.forEach( function(file){
        	if(file.search(/[.](html|hbs|handlebars)$/) === -1) return;
        	fs.readFile(__dirname + '/templates/' + file, 'utf8', function(err, data){
            	if(err) return console.error(err);
            	let templatename = file.replace(/[.](html|hbs|handlebars)$/, '');
            	templates[templatename] = data;
            	// console.log(templates);
            });
        });
    });
};
getTemplates();

// setup for express
app.use(helmet());
app.use(session({
	resave: false,
	saveUninitialized: false,
	store: new MongoStore({
      url: 'mongodb://' + config.mongo.host+':' + config.mongo.port + '/' + config.mongo.name,
      ttl: 5 * 60 * 60, // = 5 hours
      touchAfter: 5 * 60 // 5 min
    }),
	secret: config.sessionSecret
}));
app.use( bodyParser.json() );
app.use(bodyParser.urlencoded({extended: true}));

app.set("trust proxy", 1); // trust first proxy
app.set('json spaces', 4);

app.use("/common", express.static( __dirname + "/common" ));

app.use("/sockauth", function(req, res){
	if(req.body.logout){
    	req.session.user = undefined;
    	res.json({success: true});
    	return;
    } else if(req.body.token){
		tokensdb.findOne({token: req.body.token, enabled: true}, function(err, token){
			if(err){
				console.error(error);
				res.json({success: false, message: "Something went wrong on the server. 3765"});
            return;
			} else {
				req.session.user = token.user;
            	res.json({success: true, user: token.user});
            	tokensdb.deleteOne({token: token.token});
            return;
			}
		});
	} else if(req.session.user){
    	hasher(token(), function(tok){
        	if(!tok) tok = token();
        	tokensdb.insertOne({token: tok, user: req.session.user, enabled: true, added: new Date()}, function(err){
            	if(err){
					console.error(error);
					res.json({success: false, message: "Something went wrong on the server. 5638"});
                	return;
				} else {
                	res.json({success: true, user: req.session.user, token: tok});
                	return;
                }
            });
        });
    } else {
    	res.json({success: false, message: "Not currently logged in."});
    	return;
    }
});

app.get('/api/perms', (req, res) => {
	let token = req.get('authorization');
    if(token){ 
        let [user, pass] = new Buffer(token.split(" ").pop(), "base64").toString("ascii").split(":");
        token = pass || user;
    } else if(req.query.token && typeof req.query.token === 'string') token = req.query.token;
	else return res.status(401).send('Authentication Token Required.');
	tokenAuth(token, function(err, un){
		if(err){
			return res.status(401).send('Invalid Authentication Token.');
		}
		permsdb.find({username: un, enabled: true}).toArray((err, perms) => {
			if(err) return res.status(500).send('Unable to find perms.');
			res.send(perms.map(p => p.perm).join(','));
		});
	});
});

app.get('/api/users', (req, res) => {
	let token = req.get('authorization');
    if(token){ 
        let [user, pass] = new Buffer(token.split(" ").pop(), "base64").toString("ascii").split(":");
        token = pass || user;
    } else if(req.query.token && typeof req.query.token === 'string') token = req.query.token;
	else return res.status(401).send('Authentication Token Required.');
	if (typeof req.query.perm !== 'string' || !/^[\w-.]+$/.test(req.query.perm)) {
		return res.status(400).send('Permission is Required.');
	}
	request.post('https://auth.uwamakers.com/api/ping', {json: true, body:{ "token": token }}, (err, re, body) => {
			if(err || !re || re.statusCode !== 200){
            	if(err) console.error(err);
				return cb({msg: body ? body.message : "Error: Could not reach authentication server."});
			}
			permsdb.find({perm: req.query.perm, enabled: true}).toArray((err, perms) => {
				if(err) return res.status(500).send('Unable to find perms.');
				res.send(perms.map(p => p.username).join(','));
			});
		}
    );
});

/*
app.get("/api/user", function(req,res){
	if(req.query.uid && typeof req.query.uid === 'string'){
    	tagAuth(req.query.uid, function(err, un){
			if(err){
            	return res.json({success: false, message: err.message});
            }
        	res.json({success: true, user: un});
		});
    }
});

app.get("/api/perms/has", function(req,res){
	let queriableperms = ["equipment.pcbmill", "equipment.laser", "equipment.3dp", "equipment.basic", "equipment.mill", "equipment.test"];
	if(!req.query.perm || typeof req.query.perm !== 'string' || queriableperms.indexOf(req.query.perm) === -1){
    	return res.json({success: false, message: "Invalid perameters given. perm required."});
    }
	if(req.query.uid && typeof req.query.uid === 'string'){
    	tagAuth(req.query.uid, function(err, un){
			if(err){
            	return res.json({success: false, message: err.message});
            }
        	perms.has(un, req.query.perm, function(has){
            	res.json({success: true, user: un, perm: req.query.perm, hasPerm: !!has});
        	});
		});
    } else return res.json({success: false, message: "Invalid perameters given. uid required."});
});
*/

app.use("/doorlist.csv", function(req, res){
	res.type('text/csv');
	var csv = "Student Number, Fullname\n";
	var door = req.query.door || "g.19";
	usersdb.find().toArray(function(err, users){
    	if(err) console.error(err);
    	var populate = function(i){
        	if(i >= users.length){
               	res.send(csv);
    			return; //console.log("should be done");
            }
        	var user = users[i];
    		perms.has(user.username, "doors."+door, function(has){
        		if(has){
            		csv += user.username +","+ user.fullname + "\n";
            		//console.log(user.username);
            	}
        		populate(i+1);
        	});
        }
        populate(0);
    });
});

app.use("/", function(req, res){
	if(req.path.indexOf("/common") !== -1 || req.path.indexOf("/sockauth") !== -1) return;
	res.sendFile(__dirname + "/resource/main.html");
});

var hasher = function(tohash, cb){
	var hash = crypto.createHash('sha256');
	var sent = false;

	hash.on('readable', function(){
    	if(sent) return;
    	var read = hash.read();
    	if(!read && cb) cb(null);
		if(cb && read) cb(read.toString("hex"));
    	sent = true;
	});

	hash.write(tohash);
	hash.end();
}

var handlePostAuth = function(body, cb){
	if(!body.success) return cb(false, body.message);
	var user = body.user.username;
	userTokens[user] = body.userToken;
    usersdb.count({username: user}, function(err, has){
    	if(err) return cb({msg: "A problem occured on the server. Please contact an admin. 5832"});
        if(!has){
        	usersdb.insertOne({
				username: user, 
				mail: body.user.email,
				prefmail: body.user.email,
				fullname: body.user.fullname,
				firstname: body.user.firstname,
				surname: body.user.lastname, 
				added: new Date()
			}, function(err){
				if(err) {
					cb({msg: "A problem occured on the server. Please contact an admin. 3649"});
					console.error(err);
				} else cb(null, user);
			});
        } else {
           	usersdb.updateOne({username: user}, {$set: {
				fullname: body.user.fullname,
				firstname: body.user.firstname,
				surname: body.user.lastname
			}}, function(err){
				if(err) {
                    cb({msg: "A problem occured on the server. Please contact an admin. 3648"});
                    console.error(err);
                } else cb(null, user);
            });
        }
    });
};
var apiToken = config.phemeAPIToken;

var loginAuth = function(user, pass, cb){
	if(!user || !pass || !user.trim() || !pass.trim() ) return cb(false);
	user = user.trim();
	request.post('https://auth.uwamakers.com/api/login', 
		{json: true, body:{
        	"token": apiToken,
    		"user": user,
    		"pass" : pass,
        	"userToken": 86400000,
		}}, (err, res, body) => {
			if(err || !res || res.statusCode !== 200){
            	if(err) console.error(err);
				return cb({msg: body.message || "Error: Could not reach authentication server."});
			}
            handlePostAuth(body, cb);
		}
    );
};

var tokenAuth = function(token, cb){
	if(!token || typeof token !== 'string' ) return cb(false);
	request.post('https://auth.uwamakers.com/api/user/userToken', 
		{json: true, body:{
        	"token": token,
        	"userToken": 86400000,
		}}, (err, res, body) => {
			if(err || !res || res.statusCode !== 200){
            	if(err) console.error(err);
				return cb({msg: body ? body.message : "Error: Could not reach authentication server."});
			}
            handlePostAuth(body, cb);
		}
    );
};

var tagAuth = function(rawuid, cb){
	if(!cb) cb = function(){};
	if(rawuid.search(/[1-9]/) === -1 || rawuid.search(/[^0-9]/) !== -1) return cb( {message: "Invalid card, please try using a different card."}, null);
	request.post('https://auth.uwamakers.com/api/card', 
		{json: true, body:{
        	"token": apiToken,
    		"uuid": rawuid,
        	"userToken": 86400000,
		}}, (err, res, body) => {
			if(err || !res || res.statusCode !== 200){
            	if(err) console.error(err);
				return cb({msg: "Error: Could not reach authentication server."});
			}
            handlePostAuth(body, cb);
		}
    );
}

io.on('connect', function(socket){
	if(!socket.user){
    	socket.user = false;
    	socket.emit('auth.loggedout');
    } else socket.emit("main.show", "main-menu");
	socket.on('auth.login', function(data){
    	var login_success = function(username, send_token){
        	socket.user = username;
            socket.emit("main.show", "main-menu");
        	if(send_token){
				hasher(token(), function(tok){
					if(!tok) tok = token();
					tokensdb.insertOne({token: tok, user: username, enabled: true, added: new Date()}, function(err){
						if(err){
							console.error(err);
						} else {
							socket.emit("auth.makesession", tok);
						}
					});
				});
            }
        	usersdb.findOne({username: username}, function(err, userdata){
            	if(err) return console.error(err);
            	socket.emit("main.userInfo", {username: userdata.username, fullname: userdata.fullname});
            });
        }
    	if(data.token && typeof data.token == 'string' && data.token.trim() != ""){
        	tokensdb.findOne({token: data.token, enabled: true}, function(err, token){
            	if(err){
                	console.error(err);
                	socket.emit("auth.loggedout");
                } else {
                	login_success(token.user, false);
                	tokensdb.deleteOne({token: token.token});
                }
            });
        } else if(data.uid && typeof data.uid == 'string' && data.uid.trim() != ""){
			tagAuth(data.uid, function(err, username){
            	if(err) return socket.emit('auth.error', err);
            	login_success(username, true);
            });
        } else if(data.user && data.pass){
        	if(typeof data.user !== 'string' || !data.user.trim()){
            	socket.emit('auth.error', {message: "A username is required."});
            } else if(typeof data.pass !== 'string' || !data.pass.trim()){
            	socket.emit('auth.error', {message: "A password is required."});
            } else {
            	loginAuth(data.user, data.pass, function(err, username){
                	if(!err){
                    	login_success(data.user, true);
                    } else {
                    	socket.emit('auth.error', err);
                    }
                });
            }
        } else {
        	socket.emit('auth.error', {message: "Invalid login parameters passed to the server."});
        }
    });
    socket.on('auth.logout', function(){
    	socket.user = false;
    	socket.emit('auth.loggedout');
    });

	socket.on("main.menuContent", function(){
    	if(!socket.user) return;
    	var joined = false;
    	var menu = [
        	{title: "Training", icon: "fa-graduation-cap", class: "training", templates: {"training-menu": templates["training"]} },
        	{title: "Manage Key Cards", icon: "fa-id-card-o", class: "keys", templates: {"keys-menu": templates["keys"]} },
        	{title: "Makers Wiki", icon: "fa-wikipedia-w", class: "wiki", link: "https://wiki.uwamakers.com/" },
        	{title: "Facebook Group", icon: "fa-facebook-official", class: "facebook", link: "https://www.facebook.com/groups/uwamakers/" },
        	{title: "Slack Channel", icon: "fa-slack", class: "slack", link: "https://makeuwa.slack.com/" },
        	{title: "Join Coders 4 Causes?", icon: "fa-code", link: "https://codersforcauses.org/register"},
        ];
    	var count = 0;
    	var cb = function(){
        	count++;
        	if(count != 3) return;
        	if(!joined) menu = [{title: "Join Makers!", icon: "fa-rocket", class: "join"}];
        	menu.push({title: "Logout", icon: "fa-sign-out", class: "logout"});
    		socket.emit("main.menuContent", menu);
        }
        perms.has(socket.user, config.mailchimp.subPerms.makers, function(has){
        	joined = has;
        	cb();
        });
        perms.has(socket.user, ["users.read", "users.write"], function(has){
        	if(has) menu.push({title: "Users and Permissions", icon: "fa-users", class: "users", templates: {"users-menu": templates["users"]}});
        	cb();
        });
        perms.has(socket.user, ["training.write"], function(has){
        	if(has) menu.push({title: "Training Config", icon: "fa-list-alt", class: "training-config", templates: {"training-config-menu": templates["training-config"]}});
        	cb();
        });
        
    });
	
	socket.on("main.trainingContent", function(){
    	if(!socket.user) return;
    	usersdb.findOne({username: socket.user}, function(err, user){
        	if(err) return console.error(err);
			check_user_training(user, perms, content => {
				socket.emit("main.trainingContent", content);
			});
        });
    });
	
	socket.on("main.trainingConfigContent", function(){
    	if(!socket.user) return;
    	var training = JSON.parse(fs.readFileSync('./training.json'));
    	perms.has(socket.user, ["training.write"], function(has){
    		if(!has) return socket.emit("main.error", {message: "You do not have the permission to edit the training."});
    		socket.emit("main.trainingConfigContent", training);
        });
    });

	socket.on("main.keysContent", function(){
    	if(!socket.user) return;
    	var menu = {
        	userToken: userTokens[socket.user],
        	max: config.keyMax
        };
    	socket.emit('main.keysContent', menu);
    });

	socket.on("main.usersContent", function(){
    	if(!socket.user) return;
    	var menu = {
        	users: [],
        	write: false,
        	editable: config.editableperms
		};
		var training = JSON.parse(fs.readFileSync('./training.json'));
		for (let i in training){
			if(training[i].hr) continue;
			for (let p of training[i].perms) if(menu.editable.indexOf(p) === -1) menu.editable.push(p)
			for (let j in training[i].assessments){
				if(
					training[i].assessments[j].perm
					&& menu.editable.indexOf(training[i].assessments[j].perm) === -1
				) menu.editable.push(training[i].assessments[j].perm);
				if(
					training[i].assessments[j].trainingPerm
					&& menu.editable.indexOf(training[i].assessments[j].trainingPerm) === -1
				) menu.editable.push(training[i].assessments[j].trainingPerm);
			}
		}
    	perms.has(socket.user, ["users.read", "users.write"], function(has){
        	if(!has) return;
        	perms.has(socket.user, ["users.write"], function(has){
            	if(has) menu.write = true;
    			
            	usersdb.count(function(err, totalusers){
                	if(err) return console.error(err);
                	var count = 0;
                	usersdb.find().forEach(function(user){
                    	permsdb.find({username: user.username}).toArray(function(err, perms){
                        	if(err) return console.error(err);
                        	var printperms = [];
                        	for(var i in perms){
                            	var added = new Date(perms[i].added);
                            	added = added.getHours()+":"+added.getMinutes()+" "+added.getDate()+"/"+(added.getMonth()+1)+"/"+added.getFullYear();
                            	printperms.push({perm: perms[i].perm, enabled: perms[i].enabled, added: added, addedBy: perms[i].addedBy, writable: menu.editable.indexOf(perms[i].perm) !== -1});
                            }
                        	menu.users.push({username: user.username, fullname: user.fullname, perms: printperms});
                        	count++;
                        	if(count == totalusers) socket.emit("main.usersContent", menu);
                        });
                    });
                });
            });
        });
    });

	socket.on("training.induct", function(data){
    	if(!socket.user) return;
    	if(!(data.uid && typeof data.uid == 'string' && data.uid.trim() != "") && 
           !(data.user && typeof data.user == 'string' && data.user.trim() != "" && data.pass && typeof data.pass == 'string' && data.pass.trim() != "")) return;
    	if(!(data.label && typeof data.label == 'string' && data.label.trim() != "")) return;
    	var training = JSON.parse(fs.readFileSync('./training.json'));
    	for(var i in training){
        	if(training[i].label != data.label) continue;
        	for(var j in training[i].assessments){
            	if(training[i].assessments[j].type != "inperson-induction") continue;
            	var assessment = training[i].assessments[j];
            	var cb = function(err, un){
                	if(err){
                    	if(!err.unregistered) console.error(err);
                    	return socket.emit("main.error", {message: err.message});
                    }
                	perms.has(un, assessment.trainingPerm, function(has){
                    	if(!has) return socket.emit("main.error", {message: "Card holder is not authorised to perform this training."});
                    	perms.add(socket.user, assessment.perm, un, function(success){
                        	if(!success) return socket.emit("main.error", {message: "A problem occured on the server. Please contact an admin. 1834"});
                        	socket.emit("main.show", "training-menu");
                        });
                    });
                };
            	if(data.uid) tagAuth(data.uid, cb);
            	else loginAuth(data.user, data.pass, function(err, username){
                	if(err) cb(err);
                	else cb(null, data.user);
                });
            }
        }
	});
	
	socket.on("trainingConfig.save", function(data){
		if(!socket.user) return;
		perms.has(socket.user, ["training.write"], function(has){
    		if(!has) return socket.emit("main.error", {message: "You do not have the permission to edit the training."});
			validate_training_config(data).catch((err) => {
				socket.emit("main.error", {message: err.message});
			}).then( (training) => {
				const trainJson = JSON.stringify(training, null, 2);
				logsdb.insertOne({action: "trainingConfig.save", details: {training: trainJson}, time: new Date()});
				fs.writeFileSync('./training.json', trainJson);
				socket.emit("main.error", {type: 'success', title: 'Success!', message: 'The training structure provided has been saved!'});
				socket.emit("main.trainingConfigContent", training);
			});
        });
	});

	socket.on("trainingConfig.validate", function(data){
		if(!socket.user) return;
		perms.has(socket.user, ["training.write"], function(has){
    		if(!has) return socket.emit("main.error", {message: "You do not have the permission to edit the training."});
			validate_training_config(data).then( (training) => {
				const trainJson = JSON.stringify(training, null, 2);
				socket.emit("main.error", {type: 'success', title: 'Success!', message: 'The training structure provided is valid!'});
				socket.emit("main.trainingConfigContent", training);
			}).catch((err) => {
				socket.emit("main.error", {message: err.message});
			});
        });
	});

	/*socket.on("keys.add", function(data){
    	if(!socket.user) return;
    	if(!(data.uid &&  typeof data.uid == 'string' &&  data.uid.trim() != "")) return;
    	var doneNumCheck = function(){
        	tagAuth(data.uid, function(err, un){
            	if(err && !err.unregistered){
            		console.error(err);
            		return socket.emit("main.error", err);
                } else if(un){
                	return socket.emit("main.error", {message: "This card is already registered."});
                }
            	hasher(data.uid, function(uid){
                	if(!uid) return socket.emit("main.error", {message: "A problem occured on the server. Please contact an admin. 8754"});
                	tagsdb.insertOne({username: socket.user, uid: uid, enabled: true, added: new Date()}, function(err){
						if(err){
							console.error(err);
							return socket.emit("main.error", {message: "A problem occured on the server. Please contact an admin. 4568"});
						}
	                    socket.emit("main.show", "keys-menu");
					});
                });
            });
        }
        tagsdb.count({username: socket.user, enabled: true}, function(err, count){
        	if(err){
            	console.error(err);
            	return socket.emit("main.error", {message: "A problem occured on the server. Please contact an admin. 4649"});
            }
        	if(count < config.keyMax) return doneNumCheck();
    		perms.has(socket.user, "keys.unlimited", function(has){
            	if(has) return doneNumCheck();
            	return socket.emit("main.error", {message: "You are unable to register any more cards. The maximum number of cards is " + config.keyMax});
        	});
        });
    });

	socket.on("keys.remove", function(index){
    	if(!socket.user) return;
    	if(Number(index) == NaN || Number(index) < 1) return console.error("index too small/invalid. "+ index);
    	index = Number(index) - 1;
    	tagsdb.find({username: socket.user}).toArray(function(err, tags){
        	if(err) return console.error(err);
        	if(index >= tags.length) return console.error("index too large. "+ index);
           	tagsdb.updateOne({_id: tags[index]._id}, {$set: {enabled: false}}, function(err){
            	if(err) return console.error(err);
            	socket.emit("main.show", "keys-menu");
            });
        });
    });*/

	socket.on("users.perm-write", function(data){
    	if(!socket.user || !data.username || typeof data.username !== 'string' || 
           !data.perm || typeof data.perm !== 'string' || !data.action || typeof data.action !== 'string' ) return;
    	if(data.action != "toggle" && config.editableperms.indexOf(data.perm) === -1) return;
    	perms.has(socket.user, "users.write", function(has){
        	if(!has) return;
        	var callback = function(success){
            	if(!success) return socket.emit("main.error", {message: "A problem occured on the server. Please contact an admin. 5830"});
                socket.emit("main.show", "users-menu");
            };
        	if(data.action == "add") perms.add(data.username, data.perm, socket.user, callback);
        	else if(data.action == "remove") perms.remove(data.username, data.perm, callback);
        	else if(data.action == "toggle") perms.toggle(data.username, data.perm, callback);
        });
    });

	socket.on('joining.join', function(result){
    	if(!socket.user) return;
    	var count = 1;
    	if(result) count++;
    	var errored = false;
    	var cb = err => {
        	count--;
        	if(err) errored = true;
        	if(count > 0) return;
            if(errored) return socket.emit("main.error");
        	socket.emit("main.show", "main-menu");
        	socket.emit("joining.joined");
        }
        mailchimp.subscribe(socket.user, "makers", cb);
    	if(result) mailchimp.subscribe(socket.user, "newsletter", cb);
    });

	socket.on('main.pass4perm', function(data){
    	if(!socket.user) return;
    	if(!data.perm || !data.pass ) return;
    	if(!config.pass4perm || !config.pass4perm[data.perm] || config.pass4perm[data.perm] !== data.pass){
        	return socket.emit("main.error", {message: "Incorrect Password."});
        }
    	perms.has(socket.user, "joining.joined", function(has){
        	if(!has) return socket.emit("main.error", {message: "You must first join the makers."});
			perms.add(socket.user, data.perm, undefined, function(success){
				if(!success) return socket.emit("main.error", {message: "A problem occured on the server. Please contact an admin. 8652"});
				socket.emit("main.show", "main-menu");
            	socket.emit("main.error", {title: "Success!", type: "success", message: "Success!"});
			});
        });
    });

});




MongoClient.connect('mongodb://' + config.mongo.host+':' + config.mongo.port + '/' + config.mongo.name, function(err, db) {
	if(err) return console.error(err);
	database = db;
	var count = 0;
	var callback = function(err){
    	if(err) return console.error(err);
    	count++;
    	if(count >= 5){
        	//db.listCollections().toArray(function(err, res){console.log("DB Structure: " + JSON.stringify(res));});
        
        	check_mail = require('./lib/accessmail.js')(usersdb, logsdb, permsdb);
        	var interval_checks = function(){
            	usersdb.find().toArray(function(err, users){
                	if(err) return console.error(err);
					var completed = 0;
					check_user_training(users, perms, content => {
						check_mail();
					});
                });
            }
        	setInterval(interval_checks, 10*60*1000);
        	interval_checks();
        
        	var MailChimp = require('./lib/mailchimp.js');
        	mailchimp = new MailChimp(app, usersdb, logsdb, perms);
			if(config.https.enabled){
        		server.listen(config.https.port); // start main server
            	console.log("Server Started on port: " + config.https.port);
            	if(config.http.enabled){
                	re_server.listen(config.http.port);
                	console.log("Server Started on port: " + config.http.port);
                }
            } else {
            	server.listen(config.http.port);
            	console.log("Server Started on port: " + config.http.port);
            }
        }
    };
	db.collection("users", function(err, coll){
    	if(err) return callback(err);
    	usersdb = coll;
    	callback(null);
    });
	db.collection("tags", function(err, coll){
    	if(err) return callback(err);
    	tagsdb = coll;
    	callback(null);
    });
	db.collection("perms", function(err, coll){
    	if(err) return callback(err);
    	permsdb = coll;
    	perms = require("./lib/perms.js")(coll);
    	callback(null);
    });
	db.collection("logs", function(err, coll){
    	if(err) return callback(err);
    	logsdb = coll;
    	callback(null);
    });
	db.collection("tokens", function(err, coll){
    	if(err) return callback(err);
    	tokensdb = coll;
    	callback(null);
    });
});
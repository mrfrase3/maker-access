var request = require("request");

module.exports = function(users, url, cb){
	if(!Array.isArray(users)) users = [users];
	for(let i in users) if(users[i].username) users[i] = users[i].username;
	request(url, function(err, res, body){
    	if(err) return cb(err, null);
    	if(res.statusCode !== 200) return cb({message: "error on respons: " + res.statusCode}, null);
    	var rows = body.split('\n');
    	var labs = rows[0].toLowerCase().split(',');
    	for(var i in labs) labs[i] = labs[i].trim();
    	var userIndex = labs.indexOf("user");
    	if(userIndex === -1) return cb({message: "unknown labels in quiz data."}, null);
    	var results = {};
    	var result;
    	for(var i = 1; i < rows.length; i++){
        	result = rows[i].split(',');
    		for(var x in result) result[x] = (result[x]+"").trim();
        	if(users.indexOf(result[userIndex]) !== -1){
            	results[result[userIndex]] = {};
            	for(var j in labs){
                	results[result[userIndex]][labs[j]] = Number(result[j]);
                }
            	results[result[userIndex]].user = result[userIndex];
            }
        }
    	for(var i in users){
        	if(!results[users[i]]){
            	results[users[i]] = {};
            	for(var j in labs){
                	results[users[i]][labs[j]] = 0.00;
                }
            	results[users[i]].user = users[i];
            }
        }
    	cb(null, results);
    });
}
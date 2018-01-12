var Perms = function(permsdb){
	this.permsdb = permsdb;
}

Perms.prototype.has = function(user, perms, cb, all){
	if(typeof perms === 'string') perms = [perms];
	this.permsdb.count({username: user, perm: {$in: perms}, enabled: true}, function(err, count){
    	if(err){
        	console.error(err);
        	cb(false);
        }
    	else if((!all && count > 0) || (all && count >= perms.length)) cb(true);
    	else cb(false);
    });
}

Perms.prototype.add = function(user, perms, addedBy, cb){
	if(typeof addedBy == 'function'){
    	cb = addedBy;
    	addedBy = "unknown";
    }
	var self = this;
	if(typeof perms === 'string') perms = [perms];
	var c = 0;
	var good = true;
	var addperm;
	var checkDone = function(noerr){
    	if(!noerr) good = false;
    	c++;
    	if(c >= perms.length){
        	if(cb) cb(good);
        } else {
        	addperm(c);
        }
    }
    addperm = function(i){
		self.permsdb.count({username: user, perm: perms[i]}, function(err, count){
    		if(err){
    	    	console.error(err);
    	    	checkDone(false);
    	    } else if(count === 0){
    	    	self.permsdb.insertOne({username: user, perm: perms[i], enabled: true, added: new Date(), addedBy: addedBy}, function(err){
                	if(err){
                    	console.error(err);
                    	checkDone(false);
                    } else checkDone(true);
                });
    	    } else checkDone(false);
    	});
    }
    addperm(0);
}

Perms.prototype.remove = function(user, perms, cb){
	if(typeof perms === 'string') perms = [perms];
	var self = this;
	self.permsdb.deleteMany({username: user, perm: {$in: perms}}, function(err){
    	if(err) console.error(err);
    	if(cb) cb(!err); 
    });
}

Perms.prototype.toggle = function(user, perms, cb){
	if(typeof perms === 'string') perms = [perms];
	var self = this;
	var c = 0;
	var good = true;
	self.permsdb.count({username: user, perm: {$in: perms}}, function(err, count){
    	if(err){
        	console.error(err);
    		if(cb) cb(false); 
        	return;
        }
    	self.permsdb.find({username: user, perm: {$in: perms}}).forEach(function(permobj){
        	self.permsdb.updateOne({_id: permobj._id}, {$set:{enabled: !permobj.enabled}}, function(err){
            	if(err){
                	console.error(err);
                	good = false;
                }
            	c++;
            	if(c == count && cb) cb(good);
            });
        }, function(err){
        	if(err){
        		console.error(err);
    			if(cb) cb(false); 
        		return;
        	}
        });
    });
}

module.exports = function(permsdb){ return new Perms(permsdb);};




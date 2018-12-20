var get_quiz_mark = require('./get_quiz_mark');
var fs = require('fs');

var check_single = function(user, perms, training, cb){
    var content = new Array(training.length);
            	
    var checkDone = function(){
    	var done = true;
       	for(var i in training){
           	if(!content[i] || !done){
               	done = false;
               	break;
            }
           	var complete = true;
        	if(!content[i].hr){
                for(var j in training[i].assessments){
                    if(!content[i].assessments[j]){
                        done = false;
                        break;
                    }
                    if(training[i].assessments[j].required && !content[i].assessments[j].complete){
                        complete = false;
                    }
                }
    	   		if(complete && done){
              		content[i].complete = true;
               		perms.add(user.username, training[i].perms);
            	}
            }
        }
       	if(done){
           	if(cb) cb(content);
        }
    }
            
    var buildcourse = function(i){
    	if(training[i].hr){
        	content[i] = {hr: true};
        	return checkDone();
        }
       	content[i] = {title: training[i].title, label: training[i].label, assessments: new Array(training[i].assessments.length), complete: false};
       	var buildassessments = function(j){
           	var assessment = {title: training[i].assessments[j].title, type: training[i].assessments[j].type, assnum: j+1};
           	if(assessment.type === "comment-link"){
               	assessment.link = training[i].assessments[j].link;
               	content[i].assessments[j] = assessment;
               	checkDone();
            } else if(assessment.type === "google-quiz"){
               	assessment.link = training[i].assessments[j].link;
				assessment.complete = false;
				get_quiz_mark(training[i].assessments[j].results, user.username).then( (mark) => {
					if(mark >= training[i].assessments[j].reqmark){
						assessment.complete = true;
					}
					if(mark) assessment.title += ` (${(mark*100).toFixed(2)}%)`;
					else assessment.title += ' (incomplete)';
				}).catch(console.error).then( () => {
					content[i].assessments[j] = assessment;
					checkDone();
				});
            } else if(assessment.type === "inperson-induction"){
               	assessment.link = "javascript:;";
               	assessment.complete = false;
               	perms.has(user.username, training[i].assessments[j].perm, function(has){
                  	if(has) assessment.complete = true;
               		content[i].assessments[j] = assessment;
               		checkDone();
                });
            } else if(assessment.type === "perm-timeout"){
           		assessment.link = "javascript:;";
               	assessment.complete = false;
                perms.permsdb.findOne({
                   	username: user.username, 
                   	perm: training[i].assessments[j].perm, 
                   	enabled: true//, 
                   	//added: {$lte: new Date(Date.now() - training[i].assessments[j].time*60*60*1000)}
                }, function(err, permEntry){
    				if(err){
       					console.error(err);
        			}
                	else if(permEntry && (new Date(permEntry.added)).getTime() <= Date.now() - training[i].assessments[j].time*60*60*1000) assessment.complete = true;
                	//console.log(assessment.complete);
               		content[i].assessments[j] = assessment;
               		checkDone();
                });
           	} else {
               	content[i].assessments[j] = assessment;
               	checkDone();
            }
        }
        for(var j in training[i].assessments) buildassessments(Number(j));
    }
    for(var i in training) buildcourse(Number(i));
}

module.exports = function(users, perms, cb){
	var contents = {};
	var training = JSON.parse(fs.readFileSync('./training.json'));
	if(!Array.isArray(users)) return check_single(users, perms, training, cb);
	var check_users = function(c){
    	check_single(users[c], perms, training, function(content){
			contents[users[c].username] = content;
			if(c+1 < users.length) return check_users(c+1);
			if(cb) cb(contents);
        });
	};
	check_users(0);
}



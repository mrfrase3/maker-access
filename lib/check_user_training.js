module.exports = function(user, results, perms, cb){
	var result = results[user.mail];
    var training = require("../training.json");
    var content = new Array(training.length);
            	
    var checkDone = function(){
    	var done = true;
       	for(var i in training){
           	if(!content[i] || !done){
               	done = false;
               	break;
            }
           	var complete = true;
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
       	if(done){
           	if(cb) cb(content);
        }
    }
            
    var buildcourse = function(i){
       	content[i] = {title: training[i].title, label: training[i].label, assessments: new Array(training[i].assessments.length), complete: false};
       	var buildassessments = function(j){
           	var assessment = {title: training[i].assessments[j].title, type: training[i].assessments[j].type, assnum: j+1};
           	if(assessment.type == "comment-link"){
               	assessment.link = training[i].assessments[j].link;
               	content[i].assessments[j] = assessment;
               	checkDone();
            } else if(assessment.type == "google-quiz"){
               	assessment.link = training[i].assessments[j].link;
               	assessment.complete = false;
               	if(result[training[i].label] >= training[i].assessments[j].reqmark){
                   	assessment.complete = true;
                }
               	content[i].assessments[j] = assessment;
    	       	checkDone();
            } else if(assessment.type == "inperson-induction"){
               	assessment.link = "javascript:;";
               	assessment.complete = false;
               	perms.has(user.username, training[i].assessments[j].perm, function(has){
                  	if(has) assessment.complete = true;
               		content[i].assessments[j] = assessment;
               		checkDone();
                });
            } else if(assessment.type == "perm-timeout"){
           		assessment.link = "javascript:;";
               	assessment.complete = false;
                perms.permsdb.count({
                   	username: user.username, 
                   	perm: training[i].assessments[j].perm, 
                   	enabled: true, 
                   	added: {$lte: new Date(Date.now() - training[i].assessments[j].time*60*60*1000)}
                }, function(err, count){
    				if(err){
       					console.error(err);
        			}
    				else if(count > 0) assessment.complete = true;
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



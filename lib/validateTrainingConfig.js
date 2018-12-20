const request = require("request");
const parse = require('csv-parse');

module.exports = async (training) => {
    const errors = {};
    const addError = (mod, error) => {
        const title = training[mod].title || 'Module ' + (mod+1);
        if(!errors[title]) errors[title] = [];
        errors[title].push(error);
    };
    const checkPerms = (i, perms) => {
        if(!Array.isArray(perms) || !perms.length) return addError(i, 'Permission required.');
        perms.forEach(perm => {
            if(typeof perm !== 'string') addError(i, 'Invalid permission type provided.');
            else if(!/^[\w-]+\.[\w-.]*\w$/.test(perm)) addError(i, `Invalid Permission '${perm}'. alphanumeric, '-', and '_' only with at least on '.' in the middle.`);
        });
    }
    const checkStr = (i, str, name) => {
        if(typeof str !== 'string' || !str.trim()) addError(i, name + ' is required.');
        else return str.trim();
        return '';
    }
    const checkEmails = (i, emails, name, required=false) => {
        if(!Array.isArray(emails)) addError(i, `Invalid ${name} List Provided.`);
        else if(!required && emails.length === 1 && !emails[0]) return [];
        else return emails.map(v=>checkStr(i, v, name));
        return [];
    };

    const newTraining = await Promise.all(training.map(async (mod, i) => {
        if(mod.hr) return {hr: true};
        const newMod = {title: mod.title, label: mod.label, perms: mod.perms, assessments: []};
        newMod.title = checkStr(i, mod.title, 'Module Title');
        if(typeof mod.label !== 'string' || !/^[\w-]+$/.test(mod.label)) addError(i, 'Module label `'+mod.label+'` is invalid, alphanumeric, `-``, and `_` only.');
        checkPerms(i, mod.perms);
        if(!Array.isArray(mod.assessments) || !mod.assessments.length) addError(i, 'Assessments are required.');
        else newMod.assessments = await Promise.all(mod.assessments.map((ass, j) => {
            return new Promise((resolve, reject) => {
                let newAss = {title: ass.title, type: ass.type, required: ass.required};
                newAss.title = checkStr(i, ass.title, 'Assessment Title');
                if(typeof ass.required !== 'boolean') addError(i, 'Invalid Required value.');
                if(['comment-link', 'google-quiz', 'inperson-induction', 'perm-timeout'].indexOf(ass.type) === -1){
                    addError(i, 'Invalid Assessment Type.');
                    return resolve(newAss);
                }
                if(ass.type === 'inperson-induction') {
                    checkPerms(i, [ass.perm]);
                    checkPerms(i, [ass.trainingPerm]);
                    newAss = {...newAss, perm: ass.perm, trainingPerm: ass.trainingPerm};
                } else if(ass.type === 'perm-timeout'){
                    checkPerms(i, [ass.perm]);
                    ass.time = Number(ass.time);
                    if(isNaN(ass.time) || ass.time < 0) addError(i, 'Invalid Hours To Wait Provided, must be 0 or more.');
                    newAss = {...newAss, perm: ass.perm, time: ass.time};
                } else {
                    ass.link = checkStr(i, ass.link, 'Assessment Link');
                    newAss = {...newAss, link: ass.link};
                }
                if(ass.type === 'google-quiz') {
                    ass.reqmark = Number(ass.reqmark);
                    if(isNaN(ass.reqmark) || ass.reqmark <= 0 || ass.reqmark > 1) addError(i, 'Invalid Pass Mark Provided, must be between 0.01 and 1.');
                    ass.results = checkStr(i, ass.results, 'Assessment Results Link');
                    newAss = {...newAss, reqmark: ass.reqmark, results: ass.results};
                    if(!ass.results) return resolve(newAss);
                    request(ass.results, (err, res, body) => {
                        if(err || !res || res.statusCode !== 200 || typeof body !== 'string'){
                            addError(i, 'Unable to use results link to fetch anything.');
                            return resolve(newAss);
                        }
                        parse(body.trim(), (err, records) => {
                            if(err || !records.length){
                                addError(i, 'Unable to use results link to fetch a valid csv.');
                                return resolve(newAss);
                            }
                            const keys = records[0];
                            if(keys.indexOf('Score') === -1) addError(i, 'No column labeled exactly `Score` was found, this should be in the results automatically if you have set the form to a quiz.');
                            phemeKeyCount = keys.filter(k => /pheme/i.test(k)).length;
                            if(phemeKeyCount === 0) addError(i, 'There is no coloumn label containing `Pheme`, there must be one for collecting pheme numbers.');
                            if(phemeKeyCount > 1) addError(i, 'There more than one coloumn label containing `Pheme`, there must be one for collecting pheme numbers.');
                            resolve(newAss);
                        });
                    });
                } else resolve(newAss);
            });
        }));
        if(Array.isArray(mod.accessmail)) newMod.accessmail = mod.accessmail.map((mail, j) => {
            let newMail = {
                type: mail.type, 
                sendon: mail.sendon, 
                email: {
                    from: '"MakerBot"robot@makeuwa.com',
                    to: mail.email.to,
                    cc: mail.email.cc,
                    bcc: mail.email.bcc,
                    subject: mail.email.subject,
                    html: mail.email.html,
                },
            };
            if(['individual', 'group'].indexOf(mail.type) === -1) addError(i, 'Invalid Mail Type.');
            if(['instant', 'weekly'].indexOf(mail.sendon) === -1){
                addError(i, 'Invalid Send Delay Type.');
                return resolve(newMail);
            }
            if(mail.sendon === 'weekly'){
                mail.hour = Math.floor(Number(mail.hour));
                if(isNaN(mail.hour) || mail.hour < 0 || mail.hour > 23) addError(i, 'Invalid Send Hour Provided, must be between 0 and 23.');
                if(!Array.isArray(mail.days) || !mail.days.length) addError(i, 'Send Days are required, please select at least one.');
                else {
                    mail.days.forEach( (d) => {
                        if([0,1,2,3,4,5,6].indexOf(d) === -1) addError(i, 'Invalid Day Provided.');
                    });
                }
                newMail = {...newMail, hour: mail.hour, days: mail.days};
            }
            newMail.email.subject = checkStr(i, mail.email.subject, 'Email Subject');
            newMail.email.html = checkStr(i, mail.email.html, 'Email Message');
            newMail.email.to = checkEmails(i, mail.email.to, 'Email Recipient', true);
            newMail.email.cc = checkEmails(i, mail.email.cc, 'Email CC');
            newMail.email.bcc = checkEmails(i, mail.email.bcc, 'Email BCC');
            return newMail;
        });
        return newMod;
    }));

    if(Object.keys(errors).length){
        let err = '<div style="text-align: left;">';
        for(let i in errors){
            err += `<b>${i}:</b><br><ul><li>${errors[i].join('</li><li>')}</li></ul><br>`
        }
        err += '</div>';
        throw new Error(err);
    }
    return newTraining;
};
const request = require("request");
const parse = require('csv-parse');

const cache = {};
const fetch_csv = (url) => {
    return new Promise((resolve, reject) => {
        if(cache[url] && Date.now() - cache[url].time < 60*1000) return resolve(cache[url].csv);
        request(url, (err, res, body) => {
            if(err || !res || res.statusCode !== 200 || typeof body !== 'string'){
                console.error(`Unable to fetch results url: ${url}`);
                if(cache[url]) return resolve(cache[url].csv)
                return reject(new Error(`Unable to fetch results url: ${url}`));
            }
            cache[url] = {time: Date.now(), csv: body};
            resolve(body);
        });
    });
};

const score = (v) => {
    v = v.replace(/\s/g, '').split('/');
    if(v.length !== 2) return 0;
    if(Number(v[1]) === 0) return 0;
    return Number(v[0]) / Number(v[1]);
};

module.exports = (url, username) => {
    return new Promise((resolve, reject) => {
        fetch_csv(url).then( (csv) => {
            let userColumn = '';
            parse(csv, {
                columns: true,
                relax_column_count: true,
                cast: (v, c) => {
                    if(/pheme/i.test(c.column.name)) {
                        userColumn = c.column.name;
                        if(/^\d{5}$/.test(`${v}`)) return `000${v}`;
                        return `${v}`;
                    }
                    return v;
                },
            }, (err, records) => {
                if(err) return reject(err);
                const marks = records.filter( q => 
                    q[userColumn] === username
                    || (
                        q['Email address']
                        && q['Email address'].indexOf(username) === 0 
                    )
                );
                resolve(marks.reduce((a, q) => Math.max(score(q.Score), a), 0));
            });
        }).catch(reject);
    });
};
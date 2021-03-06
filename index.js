const http = require('http-https')
const parse = require('url').parse;
const format = require('url').format;
const stringify = require('querystring').stringify;

const seqSort = (a, b) => {
    if (a.sequence > b.sequence) {
        return 1;
    }
    if (a.sequence < b.sequence) {
        return -1;
    }
    return 0;
};

class ZoneMinder {
    constructor(options) {
        if (!options) {
            throw Error('options must be provided..');
        }

        ['user', 'password', 'host'].forEach(key => {
            if (!options[key]) {
                throw Error(`options.${key} must be supplied..`);
            }
        });
        
        options.host = options.host.replace(/\/$/, '');
        
        this.options = options;

        this._cookies = null;
    }

    fetch (url, post, callback) {
        if (!this._cookies && !this.isAuth) {
            return this.auth((e, cookies) => {
                if (e) {
                    throw Error(e);
                }
                this.fetch(url, post, callback);
            });
        }
        this.isAuth = false;
        if (typeof post === 'function') {
            callback = post;
            post = null;
        }
        let d = parse(this.options.host + url, true);
        if (this._cookies) {
            d.query.token = this._cookies.access_token;
            d = parse(format(d), true);
        }
        var body = null;
        d.method = 'GET';
        d.headers = d.headers || {};
        if (post) {
            post = stringify(post);
            d.method = 'POST';
            d.headers['content-type'] = 'application/x-www-form-urlencoded';
            d.headers['content-length'] = post.length;
        }
        d.headers['user-agent'] = '@nodeminder-api';

        const req = http.request(d, (res) => {
            var data = '';
            res.on('data', (d) => {
                data += d;
            });
            res.on('error', (e) => {
                console.log('Error', e, url);
            });
            res.on('end', () => {
                var json, e;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    json = data;
                }
                if (json && json.success === false) {
                    e = json;
                    json = null;
                }
                callback(e, json, res);
            });
        });
        req.on('error', callback);
        if (post) {
            req.write(post);
        }
        req.end();
    }

    reauth() {
        delete this._cookies;
    }

    servers(callback) {
        this.fetch('/api/servers.json', (e, json) => {
            if (e) {
                this.reauth();
                this.servers(callback);
                return;
            }
            const servers = {};
            json.servers && json.servers.forEach(i => {
                servers[i.Server.Id] = i.Server;
            });
            callback(e, servers);
        })
    }

    authKey(id, callback) {
        this.fetch(`/index.php?view=watch&nid=${id}`, (e, data) => {
            const auth = data.match('auth=(.*?)&');
            const authKey = auth && auth[1];
            callback(null, authKey);
        });
    };

    auth(callback) {
        this.isAuth = true;
        this.fetch('/api/host/login.json', {
            user: this.options.user,
            pass: this.options.password,
        }, (e, json, r) => {
            this._cookies = json;
            callback(null, json);
        });
    }
    
    set connKey(key) {
        this._connKey = key;
    }

    get connKey() {
        return this._connKey || (Math.floor((Math.random() * 999999) + 1)).toString();
    }

    _monitors (all, callback) {
        if (typeof all === 'function') {
            callback = all;
            all = false;
        }
        this.servers((e, servers) => {
            this.fetch('/api/monitors.json', (e, json) => {
                const devices = [];
                json.monitors && json.monitors.forEach((item) => {
                    if (!item || !item.Monitor || item.Monitor.Enabled !== '1') {
                        return;
                    }
                    if (all) {
                        return devices.push(item.Monitor);
                    }
                    const imgHost = servers[item.Monitor.ServerId].Hostname || this.options.host;
                    const imgBase = `http://${imgHost}/zm/cgi-bin/nph-zms`;
                    devices.push({
                        id: Number(item.Monitor.Id),
                        name: item.Monitor.Name,
                        sequence: Number(item.Monitor.Sequence),
                        image: `${imgBase}?mode=jpeg&scale=100&maxfps=5&monitor=${item.Monitor.Id}`
                    });
                });
                if (all) {
                    return callback(null, devices);
                }
                devices.sort(seqSort);
                if (!devices.length) {
                    return callback(devices);
                }
                this.authKey(devices[0].id, (e, details) => {
                    devices.forEach((item) => {
                        item.image += `&auth=${details}&connkey=${this.connKey}`;
                    });
                    callback(null, devices);
                });
            });
        });
    }
    monitors (callback) {
        this._monitors(true, callback);
    }

    cameras (callback) {
        this._monitors(callback);
    }

    alarm (id, cmd, callback) {
        const url = `/api/monitors/alarm/id:${id}/command:${cmd}.json`;
        this.fetch(url, callback);
    }

    version (callback) {
        this.fetch('/api/host/getVersion.json', callback);
    }

    status (callback) {
        this.fetch('/api/host/daemonCheck.json', callback);
    }

    restart (callback) {
        this.fetch('/api/states/change/restart.json', callback);
    }
}

module.exports = ZoneMinder;

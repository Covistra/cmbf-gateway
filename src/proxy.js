var httpProxy = require('http-proxy'),
    http = require('http'),
    https = require('https'),
    Yaml = require('js-yaml'),
    fs = require('fs'),
    packageInfo = require('./../package.json'),
    crypto = require('crypto'),
    bunyan = require('bunyan'),
    URL = require('url'),
    _ = require('lodash');

// Load proxy configuration
var conf = require('rc')(packageInfo.name, {
    log_level: 'info',
    port: 80,
    secure_port: 443
});

var log = bunyan.createLogger({name: 'proxy', level:conf.log_level || 'info'});
log.info(packageInfo.name + " Server", packageInfo.version);

// Create the proxy server used by both front servers
var proxy = httpProxy.createProxyServer();

proxy.on('proxyRes', function (res) {
    log.trace("RAW response: %d", res.statusCode, res.headers);
});

// Configure the default HTTP server
var server = http.createServer(baseRouter);
server.listen(conf.port);
server.on('upgrade', wsRouter);

var secure_certs = {};

// Configure a secure server if requested
if(conf.secure) {

    // Load the default SSL certificate for all routes that haven't got a cert/key pair
    secure_certs.default = crypto.createCredentials({
        key: fs.readFileSync(conf.secure_key),
        cert: fs.readFileSync(conf.secure_cert)
    }).context;

    var secureServer = https.createServer({

        // Default to configured SSL certificate and key
        key:fs.readFileSync(conf.secure_key),
        cert:fs.readFileSync(conf.secure_cert),

        SNICallback: function(hostname) {
            log.debug("Looking for SSL certificate host host %s", hostname);
            var ctx = secure_certs[hostname];
            if(!ctx) {
                log.warn("No SSL certificate found for hostname %s. fallback to default", hostname);
                ctx = secure_certs.default;
            }
            else
                log.debug("Certificate was found for hostname %s", hostname);

            return ctx;
        }
    }, baseSecureRouter);
    secureServer.listen(conf.secure_port);
    secureServer.on('upgrade', wsRouter);
}

log.info("Loading routes from file %s", conf.routefile);
var Routes = Yaml.load(fs.readFileSync(conf.routefile)+ '');
log.info("Registering %d route(s)", Routes.length);

// Create all secure contexts for each route
_.each(Routes, function(route) {
    var url = URL.parse(route.target);

    if(route.key) {
        secure_certs[route.hostname] = crypto.createCredentials({
            key: fs.readFileSync(route.key),
            cert: fs.readFileSync(route.cert)
        }).context;
    }
    else
        secure_certs[route.hostname || url.host] = secure_certs.default;
});

// Standard proxy
function baseRouter(req, res) {
    log.debug("received request %s%s", req.headers.host, req.url);

    var rule = _.find(Routes, routeMatcher(req));
    if(rule) {
        log.debug("proxying request %s%s to target %s", req.headers.host, req.url, rule.target);

        if(rule.key) {
            res.writeHead(301, {
                Location: "https://" + rule.hostname + req.url
            });
            return res.end();
        }

        // Proxy the web request
        proxy.web(req, res, {target: rule.target, xfwd: true}, function(err) {
            if(err) {
                log.error("Error proxying request %s%s to target %s", req.headers.host, req.url, rule.target, err);
                res.writeHead(500, {
                    'Content-Type': 'text/plain'
                });
                res.end('Something went wrong. And we are reporting a custom error message.');

            }
            else
                log.trace("request  %s%s was successfully proxied to target %s", req.headers.host, req.url, rule.target);
        });
    }
    else {
        log.warn("no matching route for %s%s", req.headers.host, req.url);
        res.writeHead(503, {
            'Content-Type': 'text/plain'
        });
        res.end('unreachable route: '+req.headers.host+ req.url);
    }
}

// Standard Secure proxy
function baseSecureRouter(req, res) {
    log.debug("received request %s%s", req.headers.host, req.url);

    var rule = _.find(Routes, routeMatcher(req));
    if(rule) {
        log.debug("proxying request %s%s to target %s", req.headers.host, req.url, rule.target);

        if(rule.key && req.headers.referer) {
            var urlFrags = URL.parse(req.headers.referer);
            log.trace("Analyzing url  %s fragments:", req.headers.host, urlFrags);
            if(urlFrags.protocol === 'http:') {
                log.warn("Permanently redirecting non-secure content to our secure server");
                urlFrags.protocol = "https:";
                res.writeHead(301, {
                    Location: URL.format(urlFrags)
                });
                return res.end();
            }
            else
                log.debug("Detected protocol was ", urlFrags.protocol);
        }
        else {
            log.trace("Not a secure request or referer header is", req.headers.referer);
        }

        // Proxy the web request
        proxy.web(req, res, {target: rule.target, xfwd: true}, function(err) {
            if(err) {
                log.error("Error proxying request %s%s to target %s", req.headers.host, req.url, rule.target, err);
                res.writeHead(500, {
                    'Content-Type': 'text/plain'
                });
                res.end('Something went wrong. And we are reporting a custom error message.');

            }
            else
                log.trace("request  %s%s was successfully proxied to target %s", req.headers.host, req.url, rule.target);
        });
    }
    else {
        log.warn("no matching route for %s%s", req.headers.host, req.url);
        res.writeHead(503, {
            'Content-Type': 'text/plain'
        });
        res.end('unreachable route: '+req.headers.host+ req.url);
    }
}

function wsRouter(req, socket, head) {
    log.debug("web socket detected. Proxying ws instead");

    var rule = _.find(Routes, routeMatcher(req));
    if(rule) {
        log.debug("proxying WS request %s%s to target %s", req.headers.host, req.url, rule.target);
        proxy.ws(req, socket, head, {target: rule.target}, function(err) {
            if(err) {
                log.error("Error proxying WS request %s%s to target %s", req.headers.host, req.url, rule.target, err);
                socket.close();
            }
        });
    }
    else {
        log.warn("no matching route for %s%s", req.headers.host, req.url);
        res.end();
    }

}

function routeMatcher(req) {

    return function(t) {
        log.trace("Analyzing route", t);

        if(req.headers && req.headers.host) {
            log.trace("analysing host %s", req.headers.host);

            if(req.headers.host.match(t.pattern.host)) {
                log.trace("route host matched", t.pattern.host);

                if(t.pattern.path) {
                    var match = req.url.match(t.pattern.path);
                    log.trace("path %s was matched to %s ? ", req.url, t.pattern.path, match);
                    return match;
                }
                else {
                    log.trace("No path, so we're done");
                    return true;
                }
            }
            else
                return false;
        }
        else
            return false;
    };

}

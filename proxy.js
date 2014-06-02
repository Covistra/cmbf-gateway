var httpProxy = require('http-proxy'),
    http = require('http'),
    https = require('https'),
    Yaml = require('js-yaml'),
    fs = require('fs'),
    packageInfo = require('./package.json'),
    bunyan = require('bunyan'),
    _ = require('lodash');

// Load proxy configuration
var conf = require('rc')(packageInfo.name, {
    log_level: 'info',
    port: 80,
    secure_port: 443
});

var log = bunyan.createLogger({name: 'proxy', level:conf.log_level || 'info'});
log.info("Vibes Proxy Server", packageInfo.version);

// Create the proxy server used by both front servers
var proxy = httpProxy.createProxyServer();

proxy.on('proxyRes', function (res) {
    log.trace("RAW response: %d", res.statusCode, res.headers);
});

// Configure the default HTTP server
var server = http.createServer(baseRouter);
server.listen(conf.port);
server.on('upgrade', wsRouter);

// Configure a secure server if requested
if(conf.secure) {
    var secureServer = https.createServer({
        key:fs.readFileSync(conf.secure_key),
        cert:fs.readFileSync(conf.secure_cert)
    }, baseRouter);
    secureServer.listen(conf.secure_port);
    secureServer.on('upgrade', wsRouter);
}

log.info("Loading routes from file %s", conf.routefile);
var Routes = Yaml.load(fs.readFileSync(conf.routefile)+ '');
log.info("Registering %d routes", Routes.length);

// Standard proxy
function baseRouter(req, res) {
    log.debug("received request %s%s", req.headers.host, req.url);

    var rule = _.find(Routes, routeMatcher(req));
    if(rule) {
        log.debug("proxying request %s%s to target %s", req.headers.host, req.url, rule.target);
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
            log.debug("analysing host %s", req.headers.host);

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

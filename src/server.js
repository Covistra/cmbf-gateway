var httpProxy = require('http-proxy'),
    http = require('http'),
    https = require('https'),
    Yaml = require('js-yaml'),
    fs = require('fs'),
    packageInfo = require('./../package.json'),
    crypto = require('crypto'),
    bunyan = require('bunyan'),
    URL = require('url'),
    chokidar = require('chokidar'),
    _ = require('lodash');

// Load proxy configuration
var conf = require('rc')(packageInfo.name, {
    log_level: 'info',
    port: 80,
    secure_port: 443
});

var log = bunyan.createLogger({name: 'proxy', level:conf.log_level || 'info'});
log.info(packageInfo.name + " Server", packageInfo.version);

function Server() {
    var _this = this;

    // Create the proxy server used by both front servers
    this.proxy = httpProxy.createProxyServer();

    this.baseRouter = require('./lib/base-router')(this, conf, log);
    this.wsRouter = require('./lib/ws-router')(this, conf, log);
    this.secureRouter = require('./lib/base-secure-router')(this, conf, log);

    this.http = http.createServer(this.baseRouter);

    this.secure_certs = {};

    // Configure a secure server if requested
    if(conf.secure) {

        // Load the default SSL certificate for all routes that haven't got a cert/key pair
        this.secure_certs.default = crypto.createCredentials({
            key: fs.readFileSync(conf.secure_key),
            cert: fs.readFileSync(conf.secure_cert)
        }).context;

        this.https = https.createServer({

            // Default to configured SSL certificate and key
            key:fs.readFileSync(conf.secure_key),
            cert:fs.readFileSync(conf.secure_cert),

            SNICallback: function(hostname) {
                log.trace("Looking for SSL certificate host host %s", hostname);
                var ctx = _this.secure_certs[hostname];
                if(!ctx) {
                    log.warn("No SSL certificate found for hostname %s. fallback to default", hostname);
                    ctx = _this.secure_certs.default;
                }
                else
                    log.trace("Certificate was found for hostname %s", hostname);
                return ctx;
            }
        }, _this.secureRouter);

    }

    // Configure all known routes
    this.loadRoutes();

}

Server.prototype.loadRoutes = function() {
    var _this = this;

    log.info("Loading routes from file %s", conf.routefile);
    this.routes = Yaml.load(fs.readFileSync(conf.routefile)+ '');
    log.info("Registering %d route(s)", this.routes.length);

    // Create all secure contexts for each route
    _.each(this.routes, function(route) {
        var url = URL.parse(route.target);

        if(route.key) {
            _this.secure_certs[route.hostname] = crypto.createCredentials({
                key: fs.readFileSync(route.key),
                cert: fs.readFileSync(route.cert)
            }).context;
        }
        else
            _this.secure_certs[route.hostname || url.host] = _this.secure_certs.default;
    });
};

/**
 * intialize and start the proxy server instance
 */
Server.prototype.start = function() {
    var _this = this;

    // Configure the default HTTP server
    this.http.listen(conf.port);
    this.http.on('upgrade', this.wsRouter);

    if(this.https) {
        this.https.listen(conf.secure_port);
        this.https.on('upgrade', this.wsRouter);
    }

    this.watcher = chokidar.watch(conf.routefile, {
        ignored: /[\/\\]\./,
        persistent: true
    });

    this.watcher.on('change', function() {
        log.warn("Quickly reloading all routes to reflect detected changes");
        _this.loadRoutes();
    });

};

module.exports = new Server();

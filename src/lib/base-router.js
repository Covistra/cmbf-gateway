

// Standard proxy
module.exports = function(server, conf, log) {

    var routeMatcher = require('./route-matcher')(server, conf, log);

    function baseRouter(req, res) {
        log.trace("received request %s%s", req.headers.host, req.url);

        var rule = _.find(this.routes, routeMatcher(req));
        if(rule) {
            log.trace("proxying request %s%s to target %s", req.headers.host, req.url, rule.target);

            if(rule.key) {
                res.writeHead(301, {
                    Location: "https://" + rule.hostname + req.url
                });
                return res.end();
            }

            // Proxy the web request
            this.proxy.web(req, res, {target: rule.target, xfwd: true}, function(err) {
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

    return baseRouter.bind(server);

};



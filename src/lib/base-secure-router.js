
// secure proxy
module.exports = function(server, conf, log) {

    var routeMatcher = require('./route-matcher')(server, conf, log);

    // Standard Secure proxy
    function baseSecureRouter(req, res) {
        log.trace("received request %s%s", req.headers.host, req.url);

        var rule = _.find(this.routes, routeMatcher(req));
        if(rule) {
            log.trace("proxying request %s%s to target %s", req.headers.host, req.url, rule.target);

            //if(rule.key && req.headers.referer) {
            //    var urlFrags = URL.parse(req.headers.referer);
            //    log.trace("Analyzing url  %s fragments:", req.headers.host, urlFrags);
            //    if(urlFrags.protocol === 'http:') {
            //        log.warn("Permanently redirecting non-secure content to our secure server");
            //        urlFrags.protocol = "https:";
            //        res.writeHead(301, {
            //            Location: URL.format(urlFrags)
            //        });
            //        return res.end();
            //    }
            //    else
            //        log.debug("Detected protocol was ", urlFrags.protocol);
            //}
            //else {
            //    log.trace("Not a secure request or referer header is", req.headers.referer);
            //}

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

    return baseSecureRouter.bind(server);
};


module.exports = function(server, conf, log) {

    var routeMatcher = require('./route-matcher')(server, conf, log);

    function wsRouter(req, socket, head) {
        log.trace("web socket detected. Proxying ws instead");

        var rule = _.find(this.routes, routeMatcher(req));
        if(rule) {
            log.trace("proxying WS request %s%s to target %s", req.headers.host, req.url, rule.target);
            this.proxy.ws(req, socket, head, {target: rule.target}, function(err) {
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

    return wsRouter.bind(this);
};


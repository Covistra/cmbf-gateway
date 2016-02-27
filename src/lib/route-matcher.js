
module.exports = function(server, conf, log) {

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

    return routeMatcher.bind(server);
};

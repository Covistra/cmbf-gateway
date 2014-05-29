# Vibes Proxy

This is a reverse proxy server supporting SSL and WebSockets used to route traffic from our public URL to all our
internal servers.

## File Handle Issue

For high volume, our proxy server must handle many concurrent opened file handlers. In order to achieve this for our
proxy daemon, we use the following upstart script:

    #!upstart
    description "Vibes Proxy"
    author      "Joel Grenon"

    respawn
    respawn limit 20 5
    start on runlevel [23]
    limit nofile 32768 32768

    script
        export NODE_ENV=production
        export PROXY_LOG_LEVEL=warn
        exec /usr/local/bin/node /usr/local/bin/vibes-proxy/proxy.js 2>&1 >> /var/log/proxy.log
    end script

The `limit nofile` configuration increase the file handle limit from 2048 to 32768, which gives us plenty of room. This has completely removed any issue we had
with high request volume in the past.


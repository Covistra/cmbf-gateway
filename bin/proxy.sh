#!/bin/sh

exec /sbin/setuser vibes /usr/local/bin/node /root/vibes-proxy/src/proxy.js >>/var/log/proxy.log 2>&1

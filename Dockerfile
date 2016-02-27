FROM node:4.2.4
MAINTAINER Joel Grenon <joelgrenon@covistra.com>

RUN apt-get update && apt-get install -y openssh-server supervisor
RUN mkdir -p /var/run/sshd /var/log/supervisor
COPY etc/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

ADD . /opt/app

RUN chmod +x /opt/app/bin/proxyd

# Set the current working directory to the new mapped folder.
WORKDIR /opt/app

# Install the express generator which gives you also scaffolding tools.
RUN npm install --production

# Expose the node.js port to the Docker host.
EXPOSE 80 443 22

# This is the stock express binary to start the app.
CMD ["/usr/bin/supervisord"]

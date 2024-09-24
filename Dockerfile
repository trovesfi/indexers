FROM ubuntu:22.04 as base
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

WORKDIR /app
ADD src /app/src
COPY .env package.json schema.prisma /app
COPY apibara_install.sh /app
COPY deployment/* /app

# install deps
RUN apt-get -y update; apt-get -y install curl
RUN apt-get -y install jq
RUN apt-get install wget -y
RUN apt-get install gzip -y

# install supervisor
RUN apt-get install -y supervisor
RUN mkdir -p /var/log/supervisor

# Add NodeSource repository for the desired Node.js version (e.g., 18.x)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# Install Node.js
RUN apt-get install -y nodejs

# Verify Node.js installation
RUN node -v && npm -v

# yarn install
RUN npm install -g yarn
RUN yarn install
RUN npx prisma db push

#home/teja9999/.nvm/versions/node/v18.20.1/bin/node

# install apibara
RUN chmod +x apibara_install.sh
RUN ./apibara_install.sh

RUN echo "Installed apibara, checking"
RUN /root/.local/share/apibara/bin/apibara --version

# install sink-postgres
RUN wget https://github.com/apibara/dna/releases/download/sink-postgres%2Fv0.8.0/sink-postgres-x86_64-linux.gz
RUN gzip -d sink-postgres-x86_64-linux.gz
RUN chmod +x sink-postgres-x86_64-linux
RUN /root/.local/share/apibara/bin/apibara plugins install --file sink-postgres-x86_64-linux

# create run.sh to run multiple indexers at once
RUN chmod +x run.sh
RUN cat ./run.sh

ENTRYPOINT ["./run.sh"]

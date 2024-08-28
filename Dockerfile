FROM ubuntu:22.04 as base
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

WORKDIR /app
ADD src /app/src
COPY .env package.json schema.prisma /app
COPY apibara_install.sh /app

# install deps
RUN apt-get -y update; apt-get -y install curl
RUN apt-get -y install jq
RUN apt-get install wget -y
RUN apt-get install gzip -y

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
RUN rm -rf run.sh
RUN touch run.sh
RUN echo "#!/bin/bash" >> run.sh
RUN echo "nohup /root/.local/share/apibara/bin/apibara run --allow-env=.env src/strkfarm/deposits-withdraws.ts --sink-id=130 --status-server-address=0.0.0.0:4130 > dep-withdraw.log &" >> run.sh
RUN echo "nohup /root/.local/share/apibara/bin/apibara run --allow-env=.env src/strkfarm/harvests.ts --sink-id=140 --status-server-address=0.0.0.0:4140 > harvests.log &" >> run.sh
RUN chmod +x run.sh

RUN cat ./run.sh

ENTRYPOINT ["./run.sh"]

FROM debian:stretch-slim as runner

ENV VERSION v3.2.6
ENV SHA256SUM e13ef3145cb073c44bfb21f9880dda2d1afaf5476ee005115a85f7403061da00
ENV FILE_NAME "openethereum-linux-${VERSION}"

# show backtraces
ENV RUST_BACKTRACE 1

RUN set -ex \
  && apt-get update \
  && apt-get install -qq --no-install-recommends ca-certificates wget curl unzip \
  && rm -rf /var/lib/apt/lists/*

RUN set -ex \
  && wget https://github.com/openethereum/openethereum/releases/download/${VERSION}/openethereum-linux-${VERSION}.zip \
  && echo "${SHA256SUM} openethereum-linux-${VERSION}.zip" | sha256sum -c \
  && unzip openethereum-linux-${VERSION}.zip \
  && chmod u+x openethereum \
  && mv openethereum /usr/local/bin/ \
  && apt-get remove -qq wget unzip

ENV DATA_DIR /chain

RUN mkdir $DATA_DIR
VOLUME $DATA_DIR

COPY ./entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

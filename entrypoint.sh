#!/bin/sh
set -e

exec geth --ipcdisable --datadir $DATA_DIR "$@"

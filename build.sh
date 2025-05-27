#!/bin/bash
NODE_PATH=$1
if [ -z "$NODE_PATH" ]; then
  NODE_PATH=$(command -v node)
fi
VERSION=`node -p "require('./package.json').version"`
NODE_V=`($NODE_PATH -v)`
NODE_V=node${NODE_V//v/}
ARC=`$NODE_PATH --eval="console.log(os.arch())"`
PLATFORM=`$NODE_PATH --eval="console.log(os.platform())"`
NAME=jetstreamproxy_${VERSION}_${NODE_V}_${PLATFORM}_${ARC}
tsc
node ./esbuild.js
node --experimental-sea-config sea-config.json
cp $NODE_PATH tmp/jetstreamproxy
postject tmp/jetstreamproxy NODE_SEA_BLOB tmp/jetstreamproxy.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 
mkdir -p dist
cp tmp/jetstreamproxy dist/jetstreamproxy
tar -caf dist/${NAME}.tar.gz -C tmp jetstreamproxy
rm -rf tmp
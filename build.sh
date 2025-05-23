#!/bin/bash

VERSION=`node -p "require('./package.json').version"`
NODE_V=`node -v`
NODE_V=node${NODE_V//v/}
ARC=`uname -m`
ARC=linux_${ARC}
NAME=jetstreamproxy_${VERSION}_${NODE_V}_${ARC}
tsc
node ./esbuild.js
node --experimental-sea-config sea-config.json
cp $(command -v node) tmp/jetstreamproxy
postject tmp/jetstreamproxy NODE_SEA_BLOB tmp/jetstreamproxy.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 
rm -rf dist
mkdir -p dist
cp tmp/jetstreamproxy dist/jetstreamproxy
tar -caf dist/${NAME}.tar.gz -C tmp jetstreamproxy
rm -rf tmp
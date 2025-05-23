#!/bin/sh

tsc
node ./esbuild.js
node --experimental-sea-config sea-config.json
cp $(command -v node) tmp/jetstreamproxy
postject tmp/jetstreamproxy NODE_SEA_BLOB tmp/jetstreamproxy.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 

# JetstreamProxy
[![CodeQL](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/codeql.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/codeql.yml)
[![typecheck and test](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/test.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/test.yml)
[![lint and format](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/biome.yml/badge.svg)](https://github.com/tomo-x7/JetstreamProxy/actions/workflows/biome.yml)  
**Note:** This is the English translation of the README. For the original version, please see [README-ja.md](README-ja.md). In case of any discrepancies, the Japanese version takes precedence.  

A server that acts as a proxy for Jetstream.  
It is useful when running multiple feed generators locally, as it helps reduce network traffic.

## Features

### zstd Compression
Compresses communication with Jetstream using zstd, reducing bandwidth consumption by approximately 56%. Since the proxy handles decompression, you can reduce bandwidth usage without needing to implement the complex zstd decompression logic yourself.  
In v2, compression uses the dictionary the proxy downloads from Jetstream at startup.

### Real-time Collection Updates
Dynamically updates the collections requested from Jetstream in real-time when clients connect or disconnect. This helps minimize bandwidth consumption when there are no active connections.  
This feature also works in v2. Because v2 cannot change filters mid-stream, the proxy reconnects to Jetstream with a cursor when the set of connected clients changes. It takes care that existing clients neither miss events nor receive duplicates across the reconnection.

### Jetstream v2 Support
Supports [Jetstream v2](https://github.com/bluesky-social/jetstream/blob/main/docs/README.md).  
Choose v1 or v2 with `--jetstream-version`. One running instance speaks one version, but the same binary supports both.  
In v2 mode, the proxy connects to the official Jetstream v2 endpoint (`network.bsky.jetstream.subscribeEvents`).

## Usage

1. Download the latest version from the [Releases page](https://github.com/tomo-x7/Jetstreamproxy/releases)
2. Extract the files
3. Run the executable file named `jetstreamproxy` directly (add options if needed)
4. Connect to it
    - v1: `ws://localhost:8000`
    - v2: `ws://localhost:8000/xrpc/network.bsky.jetstream.subscribeEvents`

### Configuration
Configure using command-line options.

| Option | Description | Default Value |
|-|-|-|
| `--jetstream-version <v1\|v2>` | The Jetstream protocol version | `v1` |
| `-u, --upstream <url>` | The URL of the Jetstream server (`ws://` or `wss://`) | v1: `wss://jetstream2.us-west.bsky.network/subscribe`<br>v2: `wss://jetstream.us-east.bsky.network/xrpc/network.bsky.jetstream.subscribeEvents` |
| `-p, --port <port>` | The port number to start JetstreamProxy on | `8000` |
| `-l, --log-file <path>` | The location of the log file | Creates `log.txt` in the same directory as the executable |
| `-h, --help` | Show usage | - |

Command Example:
```sh
./jetstreamproxy --jetstream-version v2 -p 8000 -l ./log.txt
```

#### Migrating from the Old Form
Positional arguments have been removed (breaking change).  
Replace `./jetstreamproxy <url> <port> <log>` with `./jetstreamproxy -u <url> -p <port> -l <log>`.

### Supported Query Parameters

#### v1
- `wantedCollections`
    - Mimics the behavior of the official Jetstream service

- `compress`
    - Enables zstd compression using a custom dictionary, similar to Jetstream
    - Note: Communication between the Proxy and the Jetstream server is always compressed, regardless of this setting

- `onlyCommit`
    - This is an argument for a custom extension
    - When set, the proxy will ignore AccountEvent and IdentityEvent messages
 
Example URL:
```URL
ws://localhost:8000?wantedCollections=app.bsky.feed.post&wantedCollections=app.bsky.feed.like&onlyCommit
```
Including any other parameters in the URL will have no effect.

Similarly, sending any data to the server will not trigger any action.

#### v2
- `collections`
    - Specify an NSID or `<prefix>.*`
    - Can be repeated (up to 100)
    - Like Jetstream v2, it constrains only commit events

- `kinds`
    - Specify `commit`, `identity`, `account` or `sync`
    - Can be repeated

Example URL:
```URL
ws://localhost:8000/xrpc/network.bsky.jetstream.subscribeEvents?collections=app.bsky.feed.post&collections=app.bsky.graph.*&kinds=commit
```
Clients receive the same frames Jetstream v2 sends (the xrpc.v1.json envelope `{"$type":"message","payload":{...}}`), uncompressed.

The following are rejected before the upgrade with HTTP 400 and an XRPC error JSON (`{"error":"InvalidRequest",...}`):
- Unsupported parameters: `dids`, `cursor`, `zstdDictionary`, `maxMessageSizeBytes`
- v1 parameters: `wantedCollections`, `wantedDids`, `requireHello`, `compress`
- Invalid values

Any other unknown parameters are ignored.

Like Jetstream v2, clients must not send messages. Doing so closes the connection.

## Environment
Distributed binaries are for Linux only.

Tested and confirmed working on Ubuntu 24.04

Node.js 22 LTS is recommended, but it will likely also run on version 20

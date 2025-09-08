# JetstreamProxy
**Note:** This is the English translation of the README. For the original version, please see [README-ja.md](README-ja.md). In case of any discrepancies, the Japanese version takes precedence.

A server that acts as a proxy for Jetstream.  
It is useful when running multiple feed generators locally, as it helps reduce network traffic.

## Features

### zstd Compression
Compresses communication with Jetstream using zstd, reducing bandwidth consumption by approximately 56%. Since the proxy handles decompression, you can reduce bandwidth usage without needing to implement the complex zstd decompression logic yourself.

### Real-time Collection Updates
Dynamically updates the collections requested from Jetstream in real-time when clients connect or disconnect. This helps minimize bandwidth consumption when there are no active connections.

## Usage

1. Download the latest version from the [Releases page](https://github.com/tomo-x7/Jetstreamproxy/releases)
2. Extract the files
3. Run the executable file named `jetstreamproxy` directly (optional arguments can be added)
4. Connect to `ws://localhost:8000`

### Configuration
Configure using command-line arguments.

| Argument | Description | Default Value |
|-|-|-|
| 1st Argument | The URL of the Jetstream server | `wss://jetstream2.us-west.bsky.network/subscribe` |
| 2nd Argument | The port number to start JetstreamProxy on | `8000` |  
| 3rd Argument | The location of the log file | Creates `log.txt` in the same directory as the executable |  

Command Example:
```sh
./jetstreamproxy wss://jetstream2.us-west.bsky.network/subscribe 8000 ./log.txt
```

### Supported Query Parameters
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

## Environment
Distributed binaries are for Linux only.

Tested and confirmed working on Ubuntu 24.04

Node.js 22 LTS is recommended, but it will likely also run on version 20

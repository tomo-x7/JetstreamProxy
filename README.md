# JetstreamProxy

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


# FLACTORY
A straightforward CLI tool that can convert your audio to MP3, fetch online lyrics and embed cover art. Began as a very crude shell script because my Sony DAP only supports MP3, and only shows album covers when they are embedded with a 'cover' description. Existing GUI tools didn't let me do this easily, so I wrote a script using eyeD3.

## Features
Flactory will recursively perform these actions on the provided directory:
### Convert
Flactory uses ffmpeg to convert your files to a 320kbps constant bitrate, copying over metadata according to id3v2 spec.
### Cover Art
When a cover image is provided, flactory will embed this in the audio files in that directory. Note that it needs to match the following:
  - Name: cover, coverart, albumcover
  - Extension: jpg, jpeg, png, webp, bmp
### Lyrics
Flactory will call the lrclib API to fetch lyrics based on artist, trackname and album. The lyrics will be saved in a sidecar file with the same name as the file it belongs to, and an .lrc extension. Note: some applications can only read embedded lyrics (e.g. Navidrome). For this purpose I'd recommend [lrcput](https://github.com/JustOptimize/lrcput). Since I wanted to avoid a Python dependency and the project appears to be archived/unmaintained I choose not to incorporate this. If you know of an alternative I'd be very eager to hear about it!

## Installation
Download or clone this repository, and execute 

## Usage
```
node flactory.js [options]
```

Options:
```
--dir=<path>       Directory containing audio files (default: current directory)
--filetype=<ext>   Audio file extension: 'flac' or 'mp3' (default: 'flac')
--convert          Convert provided filetype to mp3 using ffmpeg. Will always be executed first.
--coverart         Embed cover art into audio files
--resize           Resize cover to a 500x500 version before embedding (keeps original cover file)
--lyrics           Attempt to fetch lyrics from lrclib and save as sidecar files
--preferlocal      Prefer local/existing lyrics over online sources
--help, -h         Show this help message and exit
```
Examples:
```
node flactory.js --filetype=mp3 --coverart --lyrics
```
Processes MP3 files in the current directory, embeds cover art and lyrics.
```
node flactory.js --dir=./albums --filetype=flac --coverart
```
Embeds coverart into FLAC files from './albums' only.

Notes:
  - You must have required dependencies installed.
  - Optional tools like 'eyeD3' or 'metaflac' are only required when working with that filetype.
  - Make sure your files are tagged appropriately! The bare minimum is: artist, album, title.
  - Converting and fetching lyrics is fine with whatever directory structure you employ. However for album covers to work, you need to have each album as its own directory. "/artist/album" or "/artist - album" is both fine.
  - Cover art should be placed in the target directory.
  - Use the preferlocal flag if you already have lyrics that you don't want overwritten.
  - When converting files to MP3, don't forget to specify --filetype. You might need to run flactory a second time to proceed with embedding covers and fetching lyrics. For example:
    - node flactory.js --convert --coverart --lyrics
      - will convert all flac files to mp3, and then embed covers in the original flac files, not resulting mp3 files. Lyrics will be fine since converting will result in identical filenames.
    - node flactory.js --convert --lyrics && node flactory.js --filetype=mp3 --coverart
      - will convert flac files to mp3, fetch lyrics, and then embed covers in the mp3 files.

## Dependencies
### NPM
  - sharp — resizes and optimizes album art
  - minimist — parses command-line flags
  - axios - HTTP client used to access lyrics API
```
npm install sharp minimist axios
```
### System
  - [ffmpeg](https://ffmpeg.org/download.html) — converts audiofiles and reads metadata (filetype-agnostic)
  - [eyeD3](https://eyed3.readthedocs.io/en/latest/installation.html) — reads and writes MP3 metadata in id3v2 spec (optional)
  - [flac](https://xiph.org/flac/download.html) - provides metaflac which reads and writes flac metadata (optional)

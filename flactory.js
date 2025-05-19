#!/usr/bin/env node

///////////////////////////////////////////////////////////////////////////////
//                                                                           //
//                                                                           //
//                                                                           //
//  GENERAL DEFINITIONS & DEPENDENCIES                                       //
//                                                                           //
//                                                                           //
//                                                                           //
///////////////////////////////////////////////////////////////////////////////

// Built-in dependencies
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const colors = require(__dirname + '/colors');

// Lower chances of being flagged as a bot
const headers = {
  'User-Agent': 'flactory (https://github.com/mmonseurs/flactory)'
};

// Handling the help flag
process.argv.forEach(argument => {
  if (argument === '-h' || argument === '--help' ||  process.argv.length === 2) {
    console.log(fs.readFileSync(__dirname + '/help.txt', 'utf8'));
    process.exit(0);
  }
});

// Try loading minimist to figure out which dependencies are actually required
console.log('Welcome to the flactory!');
console.log('Booting up machines...');
let argv;
try {
  argv = require('minimist')(process.argv.slice(2), {
    string:  [
      'dir', 
      'filetype'
    ],
    boolean: [
      'coverart', 'resize',
      'lyrics',
      'preferlocal',
      'convert'
    ],
    default: {
      'dir': '.',
      'filetype': 'flac',
      'coverart': false,
      'resize': false,
      'lyrics': false,
      'preferlocal': false
    }
  });
} catch (error) {
  consoleLogMachineStatus(dependencyMap[0], 'error');
  process.exit(1);
}

// Now run full dependency check
argv.filetype = argv.filetype.toLowerCase();
const dependencyMap = [
  { package: 'minimist', type: 'node', name: 'Inputs (minimist)', required: true },
  { package: 'sharp', type: 'node', name: 'Covers (sharp)', required: true },
  { package: 'axios', type: 'node', name: 'Web (axios)', required: true },
  { package: 'readline', type: 'node', name: 'Progress (readline)', required: true },
  { package: 'ffmpeg', type: 'sys', name: 'Metadata (ffmpeg/probe)', required: true },
  { package: 'metaflac', type: 'sys', name: 'FLAC (metaflac)', required: argv => argv.filetype === 'flac' },
  { package: 'eyeD3', type: 'sys', name: 'MP3 (eyeD3)', required: argv => argv.filetype === 'mp3' },
];
checkDeps(argv);

// Rest of the required dependencies
const sharp = require('sharp');
const axios = require('axios');
const readline = require('readline');

// General procedure-wide variables
let albumArray = [];
let fileArray = [];
let albumCount = 0;
let coversWritten = 0;

let lyricsFound = 0;
let lyricsSearched = 0;

let conversionsDone = 0;
let conversionsAttempted = 0;

// Save errors/warning for after
let errorArray = [];
let warningArray = [];
let infoArray = [];

// Fancy progress bar variable
let previousStatusHadBar = false;

// Finally start
main();





///////////////////////////////////////////////////////////////////////////////
//                                                                           //
//                                                                           //
//                                                                           //
//  ACTUAL FUNCTIONALITY                                                     //
//                                                                           //
//                                                                           //
//                                                                           //
///////////////////////////////////////////////////////////////////////////////
async function main() {
  getAlbums(argv.dir);

  if (!argv.coverart && !argv.lyrics && !argv.convert) {
    console.log('Please provide an operation to perform');
    process.exit(0);
  }

  if (argv.convert || argv.lyrics) for (const file of fileArray) {
    if (argv.convert) {
      await convertToMp3(file);
      logStatus();
    }
    if (argv.lyrics) {
      await fetchLyrics(file);
      logStatus();
    }
  }
  if (argv.coverart) for (const album of albumArray) {
    await embedCover(album);
    logStatus();
  }

  if (fileArray.length === 0 ) {
    process.stdout.write('\nWell that was quick! No audio files found...\n');
  }
  // Final summary
  process.stdout.write(
    `\nFinished with ${errorArray.length} error(s), `
    + `${warningArray.length} warning(s) `
    + `and ${infoArray.length} information(s).\n`
  );

  // Write errors/warnings to logfile
  const loggingCreated = errorArray.length + warningArray.length + infoArray.length > 0;
  if (loggingCreated) {
    const logFilePath = __dirname + '/flactory_log.txt';
    const logFile = fs.createWriteStream(logFilePath);
    errorArray.forEach(error => logFile.write('[ERROR]' + error + '\n'));

    if (errorArray.length) logFile.write('\n');
    warningArray.forEach(warning => logFile.write('[WARNING]' + warning + '\n'));

    if (warningArray.length) logFile.write('\n');
    infoArray.forEach(infoLine => logFile.write('[INFO]' + infoLine + '\n' ));

    logFile.end;
    process.stdout.write(`Check ${logFilePath} for more details.\n`);
  }

}



// ----------------------------------------------------------------------------
// Description: Keep logging up-to-date
// ----------------------------------------------------------------------------
function logStatus() {
  const statusLine = `Albums found: ${albumArray.length}` +
    (argv.coverart ? ` | Covers embedded: ${coversWritten}/${albumArray.length}` : '') +
    (argv.convert ? ` | Files converted: ${conversionsDone}/${conversionsAttempted}` : '') +
    (argv.lyrics ? ` | Lyrics found: ${lyricsFound}/${lyricsSearched}` : '');
  process.stdout.write('\r' + statusLine);
}



// ----------------------------------------------------------------------------
// Description: Get an array with only album directories (containing audio)
// ----------------------------------------------------------------------------
function getAlbums(baseDir) {
  const dirents = fs.readdirSync(baseDir, { withFileTypes: true });
  const files = dirents.filter(dirent => dirent.isFile());
  const audioFiles = files.filter(file => isAudioFile(file));
  const subdirs = dirents.filter(dirent => dirent.isDirectory());

  let isAlbum = false;
  
  for (const file of audioFiles) {
    fileArray.push(file);
    isAlbum = true;
  }
  if (isAlbum) albumArray.push(baseDir);

  subdirs.forEach(dir => {
    getAlbums(path.join(baseDir, dir.name));
  })
}



// ----------------------------------------------------------------------------
// Description: Check if file is an audiofile that we requested
// ----------------------------------------------------------------------------
function isAudioFile(fileEntity) {
  return fileEntity.name.toLowerCase().endsWith(`.${argv.filetype}`);
}



// ----------------------------------------------------------------------------
// Description: Convert files in current directory to mp3
// ----------------------------------------------------------------------------
async function convertToMp3(file) {
  const strippedFileName = path.parse(file.name).name;
  const mp3File = `${file.parentPath}/${strippedFileName}.mp3`;
  if (fs.existsSync(mp3File)) return;

  const ffmpegOptions = '-ab 320k -map_metadata 0 -id3v2_version 3';
  const ffmpegCmd = `ffmpeg -i "${file.name}" ${ffmpegOptions} "${mp3File}"`;
  try {
    execSync(ffmpegCmd, { cwd: albumDir, stdio: 'ignore' });
    conversionsDone++;
  } catch (error) {
      errorArray.push(`Error converting to MP3 in ${albumDir}: ${error}`);
  }
}



// ----------------------------------------------------------------------------
// Description: Resize coverart if necessary, then embed in files
// ----------------------------------------------------------------------------
async function embedCover(albumDir) {
  const albumCover = findCoverImage(albumDir);
  const finalAlbumCover = path.join(albumDir, 'cover_final.jpg');

  if (!albumCover) {
    logStatus();
    warningArray.push(`Missing cover image in ${albumDir}. Skipping.`)
    return;
  }

  // Resize coverart if bigger than 500x500
  const metadata = await sharp(albumCover).metadata();
  if (argv.resize && (metadata.width > 500 || metadata.height > 500)) {
    try {
      await sharp(albumCover)
          .resize({ width: 500, height: 500, fit: 'inside' })
          .jpeg({ quality: 90 })
          .toFile(finalAlbumCover);
    } catch (error) {
      errorArray.push(`Error resizing cover in ${albumDir}: ${error}`);
    }
  } else {
    fs.copyFileSync(albumCover, finalAlbumCover);
  }

  // Determine relevant command to use
  const commandMap = {
    mp3: {
      removeCovers: 'eyeD3 --remove-all-images ./*.mp3',
      embedCover: 'eyeD3 --add-image cover_final.jpg:FRONT_COVER:cover ./*.mp3'
    },
    flac: {
      removeCovers: 'metaflac --remove --block-type=PICTURE ./*.flac',
      embedCover: 'metaflac --import-picture-from=cover_final.jpg ./*.flac'
    }
  }
  const relevantCommand = commandMap[argv.filetype];
  if (!relevantCommand) {
    console.error(`Sorry, ${argv.filetype} not yet supported...`);
    return;
  }

  // Clear current images and embed coverart
  try {
    execSync(relevantCommand.removeCovers, { cwd: albumDir, stdio: 'ignore' });
    execSync(relevantCommand.embedCover,   { cwd: albumDir, stdio: 'ignore' });
    coversWritten++;
    logStatus();
  } catch (error) {
    errorArray.push(`Error embedding cover.jpg in ${albumDir}: ${error}`);
  }

  // Clean up and log status
  fs.unlinkSync(finalAlbumCover);
  logStatus();
}



// ----------------------------------------------------------------------------
// Description: Find out what the coverart is called (if there is any)
// ----------------------------------------------------------------------------
function findCoverImage(albumDir) {
  const files = fs.readdirSync(albumDir);
  const fileNames = ['cover', 'coverart', 'albumcover', 'album'];
  const fileTypes = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext).toLowerCase();

    if (fileNames.includes(base) && fileTypes.includes(ext)) {
      return path.join(albumDir, file);
    }
  }
  return null;
}



// ----------------------------------------------------------------------------
// Description: Get lyrics for all songs in the album directory
// ----------------------------------------------------------------------------
async function fetchLyrics(file) {
  const fullPath = path.join(file.parentPath, file.name);
  const metadata = {};
  const ffprobe = `ffprobe -v quiet -show_entries `
                + `format_tags=artist,album,title,track `
                + `-of default=noprint_wrappers=1 "${fullPath}"`;
  const output = execSync(ffprobe, { encoding: 'utf8' });
  //Example output:
  //TAG:ARTIST=Bastille
  //TAG:ALBUM=&
  //TAG:TITLE=Intros & Narrators

  output.split('\n').forEach(line => {
    const trimmedLine = line.slice(4); //trim 'TAG:'
    const seperatorIndex = trimmedLine.indexOf('=');

    const property = trimmedLine.slice(0, seperatorIndex);
    const value = trimmedLine.slice(seperatorIndex + 1);
    metadata[`${property.toLowerCase()}`] = value;
  });

  if (!metadata.artist || !metadata.title) {
    warningArray.push(`Missing metadata for ${file.name}. Skipped lyrics.`);
    return; //next file
  }

  const strippedFileName = path.parse(file.name).name;
  const lyricsFile = `${file.parentPath}/${strippedFileName}.lrc`;
  if (fs.existsSync(lyricsFile) && argv.preferlocal) {
    return; //next file
  }

  let foundIt = false;
  const response = await callLyricsAPI(metadata);
  lyricsSearched++;

  if (response) {
    if (response.instrumental) {
      infoArray.push(`${metadata.artist} - ${metadata.title} is instrumental.`)
      lyricsFound++;
      return; //next file
    }
    const lyrics = response.syncedLyrics || response.plainLyrics;
    if (lyrics) {
      foundIt = true;
      lyricsFound++;
      if (argv.preferlocal) {
        infoArray.push(`${metadata.artist} - ${metadata.title} already has lyrics.`)
        return;
      }
      if (fs.existsSync(lyricsFile)) fs.unlinkSync(lyricsFile);
      fs.writeFileSync(lyricsFile, lyrics, 'utf8');
      return; //next file
    }
  }

  if (!foundIt) {
    warningArray.push(`Lyrics not found for ${metadata.artist} - ${metadata.title}.`)
  }
}



// ----------------------------------------------------------------------------
// Description: Call lrclib API
// ----------------------------------------------------------------------------
async function callLyricsAPI(metadata) {
    const apiUrl = `https://lrclib.net/api/get?`
        + `artist_name=${encodeURIComponent(metadata.artist)}&`
        + `track_name=${encodeURIComponent(metadata.title)}&`
        + `album_name=${encodeURIComponent(metadata.album)}`;
    try {
      const response = await axios.get(apiUrl, { headers });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) {
        errorArray.push(`Error fetching lyrics for ${metadata.artist} - ${metadata.title}: ${error}`);
      }
      return null;
    }
}




//
//
//DEPENDENCY CHECKING BELOW
//
// ----------------------------------------------------------------------------
// Description:
// ----------------------------------------------------------------------------
function checkDeps(argv) {
  let allOK = true;

  for (const machine of dependencyMap) {
    const isRequired = typeof machine.required === 'function'
      ? machine.required(argv)
      : machine.required;

    try {
      checkDependency(machine);
      consoleLogMachineStatus(machine, 'ok');
    } catch (error) {
      if (isRequired) {
        consoleLogMachineStatus(machine, 'error');
        allOK = false;
      } else {
        consoleLogMachineStatus(machine, 'warning');
      }
    }
  }
  if (!allOK) {
    process.exit(1);
  }
  console.log('\n');
}


function checkDependency(machine) {
  const osShell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';
  const checkCmd = os.platform() === 'win32' ? 'where' : 'command -v';
  try {
    switch(machine.type) {
      case 'node':
        require(machine.package);
        break;
      case 'sys':
        execSync(
          `${checkCmd} ${machine.package}`,
          { stdio: 'ignore', shell: osShell }
        );
        break;
    }
  } catch (error) {
    throw new Error();
  }
}

function consoleLogMachineStatus(machine, type) {
  const padding = 28;
  switch (type) {
    case 'ok':
      console.log(`    ${machine.name.padEnd(padding, '.')}${colored(colors.green, '[ OK ]')}`);
      break;
    case 'error':
      console.log(`    ${machine.name.padEnd(padding, '.')}${colored(colors.bgRed, '[CRIT]')}`);
      console.log(`     └─── Please install ${machine.package}.`);
      break;
    case 'warning':
      console.log(`    ${machine.name.padEnd(padding, '.')}${colored(colors.bgYellow, '[WARN]')}`);
      console.log(`     └─── ${machine.package} currently not needed.`);
      break;
  }
}

function colored(colorCode, text) {
  return `${colorCode}${text}${colors.reset}`;
}
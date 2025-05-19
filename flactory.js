#!/usr/bin/env node

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const colors = require(__dirname + '/colors');

process.argv.forEach(argument => {
  if (argument === '-h' || argument === '--help' ||  process.argv.length === 2) {
    console.log(fs.readFileSync(__dirname + '/help.txt', 'utf8'));
    process.exit(0);
  }
});

// 1: Immediately check/load minimist to figure out
//    which dependencies are actually required
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

// 2: Now run full dependency check
argv.filetype = argv.filetype.toLowerCase();
const dependencyMap = [
  {
    package: 'minimist', type: 'node', name: 'Inputs (minimist)',
    required: true
  },
  {
    package: 'sharp', type: 'node', name: 'Covers (sharp)',
    required: true
  },
  {
    package: 'axios', type: 'node', name: 'Web (axios)',
    required: true
  },
  {
    package: 'readline', type: 'node', name: 'Progress (readline)',
    required: true
  },
  { 
    package: 'ffmpeg', type: 'sys', name: 'Metadata (ffmpeg/probe)', 
    required: true 
  },
  { 
    package: 'metaflac', type: 'sys', name: 'FLAC (metaflac)', 
    required: argv => argv.filetype === 'flac' 
  },
  { 
    package: 'eyeD3', type: 'sys', name: 'MP3 (eyeD3)', 
    required: argv => argv.filetype === 'mp3'
  },
];
checkDeps(argv);
const sharp = require('sharp');
const axios = require('axios');
const readline = require('readline');

// 3: Proceed...
const headers = { //To lower chance of getting banned as a bot
  'User-Agent': 'flactory (https://github.com/mmonseurs/flactory)'
};

const somethingToDo = (
  argv.coverart || 
  argv.lyrics || 
  argv.convert
);
let albumArray = [];
let albumCount = 0;
let coversWritten = 0;
let lyricsFound = 0;
let filesConverted = 0;

let errorArray = [];
let warningArray = [];
let infoArray = [];

let previousStatusHadBar  = false;

main();





// ----------------------------------------------------------------------------
// Description: You know
// ----------------------------------------------------------------------------
async function main() {
  getAlbums(argv.dir);

  if (!somethingToDo) {
    console.log('Please provide an operation to perform');
    process.exit(0);
  }

  logStatus();
  for (const album of albumArray) {
    albumCount++;
    logStatus();

    if (argv.convert) {
      await convertToMp3(album);
    }

    if (argv.coverart) {
      await embedCover(album, argv.resize);
    }

    if (argv.lyrics) {
      await fetchLyrics(album);
    }

  }
  if (albumCount === 0 ) {
    process.stdout.write('\nWell that was quick :)\n');
  }

  process.stdout.write(`\nFinished with ${errorArray.length} error(s), ${warningArray.length} warning(s) and ${infoArray.length} information(s).\n`);

  const loggingCreated = errorArray.length + warningArray.length + infoArray.length > 0;
  if (loggingCreated) {
    const logFile = fs.createWriteStream(__dirname + '/flactory_log.txt');
    errorArray.forEach(error => logFile.write('[ERROR]' + error + '\n'));

    if (errorArray.length) logFile.write('\n');
    warningArray.forEach(warning => logFile.write('[WARNING]' + warning + '\n'));

    if (warningArray.length) logFile.write('\n');
    infoArray.forEach(infoLine => logFile.write('[INFO]' + infoLine + '\n' ));

    logFile.end;
    process.stdout.write('Check flactory_log.txt for more details.\n');
  }

}



// ----------------------------------------------------------------------------
// Description: Keep logging up-to-date
// ----------------------------------------------------------------------------
function logStatus(progress) {
  const showProgressBar = typeof progress === 'number' && !isNaN(progress);

  // If the last draw had a bar, move cursor up to overwrite both lines
  if (previousStatusHadBar) {
    readline.moveCursor(process.stdout, 0, -2);
  } else {
    readline.moveCursor(process.stdout, 0, -1);
  }

  // First line: status summary
  const statusLine = `Albums found: ${albumCount}` +
    (argv.coverart ? ` | Covers embedded: ${coversWritten}` : '') +
    (argv.convert ? ` | Files converted: ${filesConverted}` : '') +
    (argv.lyrics ? ` | Lyrics found: ${lyricsFound}` : '');

  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(statusLine + '\n');

  // Second line: optional progress bar
  if (showProgressBar) {
    const barWidth = 40;
    const filledBarLength = Math.round(progress * barWidth);
    const bar = `[${'='.repeat(filledBarLength)}${' '.repeat(barWidth - filledBarLength)}]`;
    const percent = Math.round(progress * 100);

    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${bar} ${percent}%\n`);

    previousStatusHadBar = true;
  } else {
    readline.clearLine(process.stdout, 0);
    previousStatusHadBar = false;
  }
}


// ----------------------------------------------------------------------------
// Description: Get an array with only album directories (containing audio)
// ----------------------------------------------------------------------------
function getAlbums(baseDir) {
  const dirents = fs.readdirSync(baseDir, { withFileTypes: true });
  const files = dirents.filter(dirent => dirent.isFile());
  const subdirs = dirents.filter(dirent => dirent.isDirectory());

  if (files.some(isAudioFile)) {
    albumArray.push(baseDir);
  }
  
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
function convertToMp3(albumDir) {
  const dirents = fs.readdirSync(albumDir, { withFileTypes: true });
  const files = dirents.filter(dirent => dirent.isFile());
  const audioFiles = files.filter(file => isAudioFile(file));

  const ffmpegOptions = '-ab 320k -map_metadata 0 -id3v2_version 3';

  for (const file of audioFiles) {
    const strippedFileName = path.parse(file.name).name;
    const mp3File = `${file.parentPath}/${strippedFileName}.mp3`;
    const ffmpegCmd = `ffmpeg -i "${file.name}" ${ffmpegOptions} "${mp3File}"`;
    try {
      execSync(ffmpegCmd, { cwd: albumDir, stdio: 'ignore' });
      filesConverted++;
      logStatus(filesConverted / audioFiles.length);
    } catch (error) {
       errorArray.push(`Error converting to MP3 in ${albumDir}: ${error}`);
    }
  }
}


// ----------------------------------------------------------------------------
// Description: Resize coverart if necessary, then embed in files
// ----------------------------------------------------------------------------
async function embedCover(albumDir, makeSmaller) {
  const albumCover = findCoverImage(albumDir);
  const finalAlbumCover = path.join(albumDir, 'cover_final.jpg');

  if (!albumCover) {
    logStatus();
    warningArray.push(`Missing cover image in ${albumDir}. Skipping.`)
    return;
  }

  // Resize coverart if bigger than 500x500
  const metadata = await sharp(albumCover).metadata();
  if (makeSmaller && (metadata.width > 500 || metadata.height > 500)) {
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
async function fetchLyrics(albumDir) {
  const dirents = fs.readdirSync(albumDir, { withFileTypes: true });
  const files = dirents.filter(dirent => dirent.isFile());
  const audioFiles = files.filter(file => isAudioFile(file));

  for (const file of audioFiles) {
    const metadata = {};
    const ffprobe = `ffprobe -v quiet -show_entries `
                  + `format_tags=artist,album,title,track `
                  + `-of default=noprint_wrappers=1 "${file.name}"`;
    const output = execSync(ffprobe, { encoding: 'utf8', cwd: albumDir });
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
      continue; //next file
    }

    const strippedFileName = path.parse(file.name).name;
    const lyricsFile = `${file.parentPath}/${strippedFileName}.lrc`;
    if (fs.existsSync(lyricsFile) && argv.preferlocal) {
      continue; //next file
    }

    let foundIt = false;
    const response = await callLyricsAPI(metadata);
    if (response) {
      if (response.instrumental) {
        continue; //next file
      }
      const lyrics = response.syncedLyrics || response.plainLyrics;
      if (lyrics) {
        if (fs.existsSync(lyricsFile)) fs.unlinkSync(lyricsFile);
        fs.writeFileSync(lyricsFile, lyrics, 'utf8');
        foundIt = true;
        lyricsFound++;
        continue; //next file
      }
    }

    if (!foundIt) {
      warningArray.push(`Lyrics not found for '${metadata.title}' in ${albumDir}.`)
    }

    logStatus();
  } //End of loop
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
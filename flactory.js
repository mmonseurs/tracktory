const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const colors = require('./colors');

process.argv.forEach(argument => {
  if (argument === '-h' || argument === '--help' ||  process.argv.length === 2) {
    console.log(fs.readFileSync('./help.txt', 'utf8'));
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
      'coverart', 'smallcoverart',
      'lyrics',
      'preferlocal'
    ],
    default: {
      'dir': '.',
      'filetype': 'flac',
      'coverart': false,
      'smallcoverart': false,
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

// 3: Proceed...
const headers = { //To lower chance of getting banned as a bot
  'User-Agent': 'flactory (https://github.com/mmonseurs/flactory)'
};

const somethingToDo = (argv.coverart || argv.smallcoverart || argv.lyrics);
let albumArray = [];
let albumCount = 0;
let coversWritten = 0;
let lyricsFound = 0;

main();





// ----------------------------------------------------------------------------
// Description: You know
// ----------------------------------------------------------------------------
async function main() {
  getAlbums(argv.dir);

  if (!somethingToDo) {
    console.log('Please provide an operation to perform (--coverart');
  }

  console.log(`Found ${albumArray.length} albums...`)
  for (const album of albumArray) {
    albumCount++;
    console.log(`Processing ${album}...`)

    if (argv.coverart || argv.smallcoverart) {
      await embedCover(album, argv.smallcoverart);
    }

    if (argv.lyrics) {
      await fetchLyrics(album);
    }

  }
  if (albumCount === 0 ) {
    console.log('Well that was quick :)');
  } else {
    console.log(`\nDone! ${albumCount} albums: ${coversWritten} covers and ${lyricsFound} lyrics.`);
  }
}



// ----------------------------------------------------------------------------
// Description: Keep logging up-to-date
// ----------------------------------------------------------------------------
function logStatus() {
  process.stdout.write(
    `Albums found:${albumCount} | `
    + `Covers embedded: ${coversWritten} | `
    + `Lyrics found: ${lyricsFound}\r`
  );
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
// Description: Resize coverart if necessary, then embed in files
// ----------------------------------------------------------------------------
async function embedCover(dir, makeSmaller) {
  console.log('Embedding cover...');

  const albumCover = path.join(dir, 'cover.jpg');
  const finalAlbumCover = path.join(dir, 'cover_final.jpg');

  if (!fs.existsSync(albumCover)) {
    console.log(`Found music in ${dir} but no cover...`);
    logStatus();
    return;
  }

  //resize coverart if bigger than 500x500
  if (!fs.existsSync(smallAlbumCover) && makeSmaller) {
    const metadata = await sharp(albumCover).metadata();

    if (metadata.width > 500 || metadata.height > 500) {
      await sharp(albumCover)
            .resize({ width: 500, height: 500, fit: 'inside' })
            .toFile(finalAlbumCover);
    } else {
      fs.copyFileSync(albumCover, finalAlbumCover);
    }
  }

  const commandMap = {
    mp3: {
      removeCovers: `eyeD3 --remove-all-images ./*.mp3`,
      embedCover: `eyeD3 --add-image cover_final.jpg:FRONT_COVER:cover ./*.mp3`
    },
    flac: {
      removeCovers: `metaflac --remove --block-type=PICTURE ./*.flac`,
      embedCover: `metaflac --import-picture-from=cover_final.jpg ./*.flac`
    }
  }
  const relevantCommand = commandMap[argv.filetype];
  if (!relevantCommand) {
    console.error(`Sorry, ${argv.filetype} not yet supported...`);
    return;
  }

  try {
    execSync(relevantCommand.removeCovers, { cwd: dir, stdio: 'ignore' });
    execSync(relevantCommand.embedCover,   { cwd: dir, stdio: 'ignore' });
    coversWritten++;
  } catch (err) {
    console.error(`Error processing ${dir}:`, err.message);
  }

  //update UI/progress
  logStatus();
}


// ----------------------------------------------------------------------------
// Description: Get lyrics for all songs in the album directory
// ----------------------------------------------------------------------------
async function fetchLyrics(dir) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files = dirents.filter(dirent => dirent.isFile());
  const audioFiles = files.filter(file => isAudioFile(file));

  console.log('Fetching lyrics...');

  for (const file of audioFiles) {
    const metadata = {};
    const ffprobe = `ffprobe -v quiet -show_entries `
                  + `format_tags=artist,album,title,track `
                  + `-of default=noprint_wrappers=1 '${file.name}'`;
    const output = execSync(ffprobe, { encoding: 'utf8', cwd: dir });
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
      console.warn(`Metadata missing for '${file.name}'. Skipping.`);
      continue; //next file
    }

    const strippedFileName = path.parse(file.name).name;
    const lyricsFile = `${file.parentPath}/${strippedFileName}.lrc`;
    if (fs.existsSync(lyricsFile)) {
      console.log(`${lyricsFile} already exists. Skipping.`);
      continue; //next file
    }

    let foundIt = false;
    const response = await callLyricsAPI(metadata);
    if (response) {
      if (response.instrumental) {
        console.log(`'${currentArtist} - ${title}' is instrumental.`);
        continue; //next file
      }
      const lyrics = response.syncedLyrics || response.plainLyrics;
      if (lyrics) {
        fs.writeFileSync(lyricsFile, lyrics, 'utf8');
        foundIt = true;
        lyricsFound++;
        continue; //next file
      }
    }

    if (!foundIt) {
      console.error(`Lyrics not found for '${currentArtist} - ${title}'.`)
    }

    logStatus();
  } //End of loop

  // not yet supported. not sure how to get around figuring out where
  // lrcput.py is located without adding another flag. also looks
  // to be not maintained anymore and can't really find an alternative.
  // if (argv.embed) {
  //   try {
  //     execSync(
  //       `python lrcput.py -d '${dir}' -r`,
  //       { stdio: 'ignore' }
  //     );
  //   } catch (error) {
  //     console.error(`Failed to embed lyrics in ${dir}`);
  //   }
  // }
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
      console.error(`Failed to fetch lyrics from /api/get: ${apiUrl}\n${error.message}`);
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
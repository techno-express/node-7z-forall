#!/usr/bin/env node

'use strict';

import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { dirname, join, sep } from 'path';
import spawn from 'cross-spawn';
import unCompress from 'all-unpacker';
import retryPromise from 'retrying-promise';
import fetching from 'node-wget-fetch';
import system_installer from 'system-installer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const _7zAppUrl = 'http://7-zip.org/a/',
    _7zipData = getDataForPlatform(),
    whatToCopy = _7zipData.binaryFiles,
    cwd = process.cwd();

const versionCompare = function (left, right) {
    if (typeof left + typeof right != 'stringstring')
        return false;

    let a = left.split('.');
    let b = right.split('.');
    let i = 0;
    let len = Math.max(a.length, b.length);

    for (; i < len; i++) {
        if ((a[i] && !b[i] && parseInt(a[i]) > 0) || (parseInt(a[i]) > parseInt(b[i]))) {
            return 1;
        } else if ((b[i] && !a[i] && parseInt(b[i]) > 0) || (parseInt(a[i]) < parseInt(b[i]))) {
            return -1;
        }
    }

    return 0;
}

try {
    var appleOs = (process.platform == "darwin") ? require('macos-release').version : '';
} catch (e) {
    var appleOs = '';
}

const macOsVersion = (appleOs == '') ? appleOs :
    ((versionCompare(appleOs, '10.11.12') == 1) ? '10.15' : '10.11');

const zipExtraName = _7zipData.extraName;
const extraSource = join(cwd, zipExtraName);

const zipFilename = (process.platform != "darwin") ? _7zipData.filename :
    ((macOsVersion == '10.15') ? _7zipData.filename[1] : _7zipData.filename[0]);

const zipSfxModules = _7zipData.sfxModules;
const zipUrl = _7zipData.url;

const source = join(cwd, zipFilename);
const destination = join(cwd, process.platform);
const binaryDestination = join(__dirname, 'binaries', process.platform);
const _7zCommand = join(
    binaryDestination,
    process.platform == 'win32' ? '7za.exe' : '7za'
);

wget({
    url: _7zAppUrl + zipExtraName,
    dest: extraSource
})
    .then(function () {
        if (zipUrl != null) {
            fs.mkdir(destination, (err) => {
                if (err) { }
            });
            platformUnpacker(source, destination)
                .then(function (mode) {
                    if (!mode) {
                        throw 'Unpacking for platform failed.';
                    }
                    whatToCopy.forEach(function (s) {
                        try {
                            fs.moveSync(
                                join(
                                    destination,
                                    _7zipData.extractFolder,
                                    _7zipData.appLocation,
                                    s
                                ),
                                join(binaryDestination, s), {
                                overwrite: true
                            }
                            );
                        } catch (err) {
                            console.error(err);
                        }
                    });
                    if (process.platform != 'win32')
                        makeExecutable();

                    console.log('Binaries copied successfully!');
                    fs.unlink(source, (err) => {
                        if (err) throw err;
                    });

                    fs.remove(destination, (err) => {
                        if (err) throw err;
                    });

                    extraUnpack(
                        _7zCommand,
                        extraSource,
                        binaryDestination,
                        zipSfxModules
                    );

                    fs.unlink(extraSource, (err) => {
                        if (err) throw err;
                    });

                    console.log('Sfx modules copied successfully!');
                })
                .catch((err) => {
                    console.error(err);
                });
        }
    })
    .catch(function (err) {
        console.error('Error downloading file: ' + err);
    });

function makeExecutable() {
    var chmod = ['7z', '7z.so', '7za', '7zCon.sfx', '7zr'];
    chmod.forEach(function (s) {
        try {
            fs.chmodSync(join(binaryDestination, s), 755);
        } catch (err) {
            console.error(err);
        }
    });
}

function getDataForPlatform() {
    switch (process.platform) {
        // Windows version
        case 'win32':
            return {
                url: 'http://d.7-zip.org/a/',
                filename: '7z1900-extra.7z',
                extraName: 'lzma1900.7z',
                extractFolder: '',
                appLocation: '',
                binaryFiles: ['Far', 'x64', '7za.dll', '7za.exe', '7zxa.dll'],
                sfxModules: ['7zr.exe', '7zS2.sfx', '7zS2con.sfx', '7zSD.sfx'],
            };
        // Linux version
        case 'linux':
            return {
                url:
                    'https://iweb.dl.sourceforge.net/project/p7zip/p7zip/16.02/',
                filename: 'p7zip_16.02_x86_linux_bin.tar.bz2',
                extraName: 'lzma1604.7z',
                extractFolder: 'p7zip_16.02',
                appLocation: 'bin',
                binaryFiles: [
                    '7z',
                    '7z.so',
                    '7za',
                    '7zCon.sfx',
                    '7zr',
                    'Codecs',
                ],
                sfxModules: ['7zS2.sfx', '7zS2con.sfx', '7zSD.sfx'],
            };
        // Mac version
        case 'darwin':
            return {
                url:
                    'https://raw.githubusercontent.com/rudix-mac/packages/master/',
                filename: ['p7zip-16.02-macos10.15.pkg', 'p7zip-16.02-macos10.11.pkg'],
                extraName: 'lzma1604.7z',
                extractFolder: '',
                appLocation: 'usr/local/lib/p7zip',
                binaryFiles: [
                    '7z',
                    '7z.so',
                    '7za',
                    '7zCon.sfx',
                    '7zr',
                    'Codecs',
                ],
                sfxModules: ['7zS2.sfx', '7zS2con.sfx', '7zSD.sfx'],
            };
    }
}

function wget(path) {
    console.log('Downloading ' + path.url);
    return new Promise(function (resolve, reject) {
        fetching.wget(path.url, path.dest)
            .then((info) => resolve(info))
            .catch((err) => reject('Error downloading file: ' + err));
    });
}

function platformUnpacker(source, destination) {
    return new retryPromise({
        retries: 5
    }, function (resolve, retry) {
        wget({
            url: zipUrl + zipFilename,
            dest: source
        }).then(function () {
            if (process.platform == 'darwin') {
                console.log('Extracting: ' + zipFilename);
                unpack(source, destination)
                    .then(function () {
                        console.log('Decompressing: p7zipinstall.pkg/Payload');
                        unpack(
                            join(
                                destination,
                                'p7zipinstall.pkg',
                                'Payload'
                            ),
                            destination
                        ).then(function (data) {
                            console.log('Decompressing: Payload');
                            unpack(
                                join(destination, 'Payload'),
                                destination,
                                _7zipData.appLocation + sep + '*'
                            ).then(function () {
                                return resolve('darwin');
                            });
                        });
                    })
                    .catch((err) => {
                        retry(err);
                    });
            } else if (process.platform == 'win32') {
                unpack(source, destination)
                    .then(function () {
                        return resolve('win32');
                    })
                    .catch((err) => {
                        retry(err);
                    });
            } else if (process.platform == 'linux') {
                unpack(source, destination)
                    .then(function () {
                        const system = system_installer.packager();
                        const toInstall =
                            system.packager == 'yum' || system.packager == 'dnf' ?
                                'glibc.i686' :
                                'libc6-i386';
                        system_installer.installer(toInstall).then(function () {
                            return resolve('linux');
                        });
                    })
                    .catch((err) => {
                        retry(err);
                    });
            }
        });
    }).catch((err) => {
        console.error(err);
    });
}

function unpack(source, destination, toCopy) {
    return new Promise(function (resolve, reject) {
        return unCompress.unpack(
            source, {
            files: (toCopy == null ? '' : toCopy),
            targetDir: destination,
            forceOverwrite: true,
            noDirectory: true,
            quiet: true,
        },
            function (err, files, text) {
                if (err)
                    return reject(err);
                return resolve(text);
            }
        );
    });
}

function extraUnpack(cmd, source, destination, toCopy) {
    let args = ['e', source, '-o' + destination];
    let extraArgs = args.concat(toCopy).concat(['-r', '-aos']);
    console.log('Running: ' + cmd + ' ' + extraArgs);
    let extraUnpacker = spawnSync(cmd, extraArgs);
    if (extraUnpacker.error)
        return extraUnpacker.error;
    else if (extraUnpacker.stdout.toString())
        return extraUnpacker.stdout.toString();
}

function spawnSync(spCmd, spArgs) {
    let doUnpack = spawn.sync(spCmd, spArgs, {
        stdio: 'pipe'
    });
    if (doUnpack.error) {
        console.error('Error 7za exited with code ' + doUnpack.error);
        console.log('resolve the problem and re-install using:');
        console.log('npm install');
    }
    return doUnpack;
}
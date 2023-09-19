const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const checkDiskSpace = require('check-disk-space').default;
const fs = require('fs');
const crypto = require('crypto');
const fss = require('fs-extra');


// Function to convert bytes to GB
function bytesToGB(bytes) {
    var marker = 1024; // Change to 1000 if required
    var decimal = 2; // Change as required
    var kiloBytes = marker; // One Kilobyte is 1024 bytes
    var megaBytes = marker * marker; // One MB is 1024 KB
    var gigaBytes = marker * marker * marker; // One GB is 1024 MB
    var teraBytes = marker * marker * marker * marker; // One TB is 1024 GB

    // return bytes if less than a KB
    if (bytes < kiloBytes) return bytes + ' Bytes';
    // return KB if less than a MB
    else if (bytes < megaBytes) return (bytes / kiloBytes).toFixed(decimal) + ' KB';
    // return MB if less than a GB
    else if (bytes < gigaBytes) return (bytes / megaBytes).toFixed(decimal) + ' MB';
    // return GB if less than a TB
    else return (bytes / gigaBytes).toFixed(decimal) + ' GB';
}

// Function to compute MD5 hash of a file
function computeFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);

        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', error => reject(error));
    });
}

// Function to traverse directories and detect duplicate files
async function detectDuplicateFiles(dir) {
    const files = await fs.promises.readdir(dir);
    const fileHashes = {};

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stats = await fs.promises.stat(fullPath);

        if (stats.isDirectory()) {
            const subFileHashes = await detectDuplicateFiles(fullPath);
            for (const hash of Object.keys(subFileHashes)) {
                if (!fileHashes[hash]) {
                    fileHashes[hash] = [];
                }
                fileHashes[hash] = fileHashes[hash].concat(subFileHashes[hash]);
            }
        } else {
            const hash = await computeFileHash(fullPath);
            if (!fileHashes[hash]) {
                fileHashes[hash] = [];
            }
            fileHashes[hash].push(fullPath);
        }
    }

    return fileHashes;
}

// Function to traverse directories and get space utilization breakdown
function traverseDirectories(dir) {
    const files = fs.readdirSync(dir);
    const fileTypes = {};

    for (const file of files) 
    {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) 
        {
            const subFileTypes = traverseDirectories(fullPath);
            for (const fileType of Object.keys(subFileTypes)) {
                if (!fileTypes[fileType]) {
                    fileTypes[fileType] = 0;
                }
                fileTypes[fileType] += subFileTypes[fileType];
            }
        } 
        else 
        {
            const fileType = path.extname(file).toLowerCase();
            const fileTypeWithoutDot = fileType.substring(1);

            // Map image file types
            const imageFileTypes = ['png', 'jpg', 'jpeg'];
            const videoFileTypes = ['mp4', 'mov', 'avi'];
            const languageFileTypes = ['c', 'cpp', 'js','html','java','sql','json','css'];
            const documentFileTypes = ['pdf', 'docx', 'txt', 'pptx', 'docs', 'zip'];
            if (imageFileTypes.includes(fileTypeWithoutDot)) {
                if (!fileTypes['image']) {
                    fileTypes['image'] = 0;
                }
                fileTypes['image'] += stats.size;
            } 
            else if (videoFileTypes.includes(fileTypeWithoutDot)) {
                if (!fileTypes['video']) {
                    fileTypes['video'] = 0;
                }
                fileTypes['video'] += stats.size;
            } 
            else if (languageFileTypes.includes(fileTypeWithoutDot)) {
                if (!fileTypes['Pragramming Language files']) {
                    fileTypes['Pragramming Language files'] = 0;
                }
                fileTypes['Pragramming Language files'] += stats.size;
            } 
            else if (documentFileTypes.includes(fileTypeWithoutDot)) {
                if (!fileTypes['Document Files']) {
                    fileTypes['Document Files'] = 0;
                }
                fileTypes['Document Files'] += stats.size;
            } 
            else
            {
                // For other file types, add them as they are
                if (!fileTypes['others']) {
                    fileTypes['others'] = 0;
                }
                fileTypes['others'] += stats.size;
            }
        }
    }

    return fileTypes;
}


async function identifyLargeFiles(dir, sizeThresholdInBytes) {
    const largeFiles = [];

    const files = await fs.promises.readdir(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stats = await fs.promises.stat(fullPath);

        if (stats.isDirectory()) {
            const subLargeFiles = await identifyLargeFiles(fullPath, sizeThresholdInBytes);
            largeFiles.push(...subLargeFiles);
        } else {
            if (stats.size > sizeThresholdInBytes) {
                const fileSizeInGB = bytesToGB(stats.size);
                largeFiles.push({ path: fullPath, size: fileSizeInGB });
            }
        }
    }

    return largeFiles;
}

function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

async function scanSpecificFileType(dir, fileType) {
    const specificFiles = [];

    const files = await fs.promises.readdir(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stats = await fs.promises.stat(fullPath);

        if (stats.isDirectory()) {
            const subSpecificFiles = await scanSpecificFileType(fullPath, fileType);
            specificFiles.push(...subSpecificFiles);
        } else {
            const fileExtension = path.extname(file).toLowerCase();
            if (fileExtension === `.${fileType}`) {
                const fileSizeInGB = bytesToGB(stats.size);
                const createdDate = formatDate(stats.birthtime);
                const lastModifiedDate = formatDate(stats.mtime);
                specificFiles.push({
                    path: fullPath,
                    size: fileSizeInGB,
                    createdDate,
                    lastModifiedDate,
                });
            }
        }
    }

    return specificFiles;
}

async function deletion(path) {
    return new Promise((resolve, reject) => {
        const pathToDelete = path;
        fss.remove(pathToDelete, (err) => {
            if (err) {
                resolve('Error deleting:');
            } else {
                resolve('Deletion success.');
            }
        });
    });
}
async function deleteSpecificFileType(dir, fileType) {
    const files = await fs.promises.readdir(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stats = await fs.promises.stat(fullPath);

        if (stats.isDirectory()) {
            await deleteSpecificFileType(fullPath, fileType);
        } else {
            const fileExtension = path.extname(file).toLowerCase();
            if (fileExtension === `.${fileType}`) {
                await deletion(fullPath);
            }
        }
    }
}
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Enable the context menu for inspecting elements and Developer Tools
    mainWindow.webContents.on('context-menu', (e, params) => {
        const { x, y } = params;
        mainWindow.webContents.inspectElement(x, y);
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});



ipcMain.on('get-space-breakdown', async (event, drivePath, option, fileType) => {
    try {
        const diskSpace = await checkDiskSpace(drivePath);
        const freeSpaceInGB = bytesToGB(diskSpace.free);
        const totalSpaceInGB = bytesToGB(diskSpace.size);

        let output = `Drive: ${drivePath}\n`;
        output += `Free Space: ${freeSpaceInGB}\n`;
        output += `Total Space: ${totalSpaceInGB}\n\n`;
        if (option === 'space') 
        {
            output += 'Space Utilization Breakdown:\n';
            const fileTypes = await traverseDirectories(drivePath);

            output += '\nFile Type Breakdown:\n';
            Object.entries(fileTypes).forEach(([fileType, size]) => {
                const sizeInGB = bytesToGB(size);
                output += `${fileType}: ${sizeInGB}\n`;
            });
        } 
        else if (option === 'duplicates') 
        {
            output += 'Duplicate Files:\n';
            const fileHashes = await detectDuplicateFiles(drivePath);
            const duplicateFiles = Object.values(fileHashes).filter((files) => files.length > 1);

            if (duplicateFiles.length === 0) {
                output += 'No duplicate files found.';
            } else {
                duplicateFiles.forEach((files) => {
                    output += files.join('\n');
                    output += '\n---\n';
                });
            }
        }
        else if (option === 'identify') 
        {
            output += 'Large Files:\n';
            const largeFiles = await identifyLargeFiles(drivePath, 100 * 1024 * 1024);
            if (largeFiles.length === 0) {
                output += 'No large files found.';
            } else {
                largeFiles.forEach(({ path, size }) => {
                    output += `${path}: ${size}\n`;
                });
            }
        }
        else if (option === 'scanning') 
        {
            const specificFiles = await scanSpecificFileType(drivePath, fileType);
            if (specificFiles.length === 0) {
                output += `No ${fileType.toUpperCase()} files found.`;
            } else {
                specificFiles.forEach(({ path, size, createdDate, lastModifiedDate }) => {
                    output += `${path}\n`;
                    output += `Size: ${size}\n`;
                    output += `Created Date: ${createdDate}\n`;
                    output += `Last Modified Date: ${lastModifiedDate}\n`;
                    output += '---\n';
                });
            }
        }
        else if (option === 'delete') 
        {
            const targetPathToDelete = drivePath; // Replace this with the path of the file or folder you want to delete
            const success = await deletion(targetPathToDelete);
            output += success;
        }
        else if (option === 'deleteFileType') 
        {
            output += 'Deleting Specific File Type:\n';
            await deleteSpecificFileType(drivePath, fileType);
            output += `Deleted all files with the extension "${fileType}".`;
        }
        else 
        {
            output += 'Invalid option selected.';
        }

        event.reply('space-breakdown-data', output);
    } catch (error) {
        event.reply('space-breakdown-data', `Error getting disk space information: ${error}`);
    }
});
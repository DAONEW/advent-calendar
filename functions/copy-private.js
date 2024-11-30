const fs = require('fs-extra');
const path = require('path');

// Source and destination paths
const sourceDir = path.join(__dirname, '../private');
const destDir = path.join(__dirname, 'private');

// Copy private directory
console.log('Copying private directory...');
fs.copySync(sourceDir, destDir, {
    filter: (src, dest) => {
        // Log what's being copied
        console.log('Copying:', path.relative(__dirname, src));
        return true;
    }
});

console.log('Private directory copied successfully!');

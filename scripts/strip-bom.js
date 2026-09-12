const fs = require('fs');
const path = require('path');

function stripBOM(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      stripBOM(fullPath);
    } else if (entry.name.endsWith('.sql')) {
      const buffer = fs.readFileSync(fullPath);
      // Check for UTF-8 BOM: 0xEF, 0xBB, 0xBF
      if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        console.log(`Stripping UTF-8 BOM from ${fullPath}`);
        fs.writeFileSync(fullPath, buffer.subarray(3));
      } else {
        console.log(`No BOM found in ${fullPath}`);
      }
    }
  }
}

stripBOM(path.join(__dirname, '..', 'backend', 'prisma', 'migrations'));
console.log('BOM check complete.');

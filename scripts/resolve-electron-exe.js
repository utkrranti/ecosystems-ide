/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Altus AI contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Prints absolute path to the dev Electron executable (for .bat launchers).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const product = require(path.join(root, 'product.json'));
const electronDir = path.join(root, '.build', 'electron');
const preferred = path.join(electronDir, `${product.nameShort}.exe`);

function emit(exePath) {
	if (fs.existsSync(exePath)) {
		console.log(exePath);
		process.exit(0);
	}
}

if (!fs.existsSync(electronDir)) {
	process.stderr.write(`Missing ${electronDir}. Run: npm run electron\n`);
	process.exit(1);
}

emit(preferred);

// After rebrand: copy legacy binary so devs need not re-download Electron immediately.
const legacyNames = ['EcoSystems IDE.exe', 'Code - OSS.exe'];
for (const name of legacyNames) {
	const legacy = path.join(electronDir, name);
	if (fs.existsSync(legacy)) {
		try {
			fs.copyFileSync(legacy, preferred);
		} catch (err) {
			process.stderr.write(`Could not copy ${legacy} -> ${preferred}: ${err.message}\n`);
			emit(legacy);
		}
		emit(preferred);
	}
}

const exes = fs.readdirSync(electronDir).filter(f => f.toLowerCase().endsWith('.exe'));
if (exes.length === 1) {
	emit(path.join(electronDir, exes[0]));
}

process.stderr.write(`No Electron executable in ${electronDir}. Run: npm run electron\n`);
process.exit(1);

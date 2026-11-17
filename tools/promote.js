#!/usr/bin/env node
'use strict';
/**
 * Makes the beta the live app: copies beta/ over app/, keeping what belongs to the live app.
 *   node tools/promote.js [version]          e.g. node tools/promote.js 2.0.0
 *
 * Kept from app/: config.js (the LIVE backend address, no beta channel), media/ (the how-to video),
 * and the manifest's name and description (an installed app stays the same app on phones).
 * The live app then uses its own storage (hlep.* and the "hlep-dpr" database), so logins and
 * activities waiting to be sent stay on the phones.
 * Upgrade the LIVE Apps Script backend first: the new pages need backend w2.0 or later.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BETA = path.join(ROOT, 'beta');
const APP = path.join(ROOT, 'app');
const version = process.argv[2] || '2.0.0';
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error('Version must look like 2.0.0'); process.exit(1); }

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach((f) => {
    const a = path.join(from, f), b = path.join(to, f);
    if (fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  });
};

// 1) the live backend address, before anything is overwritten
const liveCfg = read(path.join(APP, 'config.js'));
const api = (liveCfg.match(/api:\s*'([^']+)'/) || [])[1];
if (!api || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(api)) { console.error('No live backend address found in app/config.js. Nothing changed.'); process.exit(1); }
const liveMan = JSON.parse(read(path.join(APP, 'manifest.webmanifest')));

// 2) pages, styles, modules, icons
['index.html', 'styles.css', 'v2.css', 'sw.js'].forEach((f) => fs.copyFileSync(path.join(BETA, f), path.join(APP, f)));
copyDir(path.join(BETA, 'js'), path.join(APP, 'js'));
copyDir(path.join(BETA, 'icons'), path.join(APP, 'icons'));

// 3) the core script with the live version number
let core = read(path.join(BETA, 'app.js'));
core = core.replace(/const APP_VERSION = '[^']*';/, "const APP_VERSION = '" + version + "';");
write(path.join(APP, 'app.js'), core);
// the offline worker's cache follows the version, so phones fetch the new files
write(path.join(APP, 'sw.js'), read(path.join(APP, 'sw.js')).replace(/const VERSION = '[^']*';/, "const VERSION = '" + version + "';"));

// 4) config: live backend, no beta channel; "self" so the offline worker can read it too
write(path.join(APP, 'config.js'),
  "// The web-app's backend: the /exec URL from Apps Script → Deploy → Manage deployments (Web app).\n" +
  '// Not a secret: every request still needs a team member\'s PIN.\n' +
  'self.HLEP_CONFIG = {\n  api: \'' + api + "'\n};\n");

// 5) manifest: the beta's shortcuts and photo sharing, under the live app's own name (no "id": it stays the same installed app)
const man = JSON.parse(read(path.join(BETA, 'manifest.webmanifest')));
delete man.id;
man.name = liveMan.name; man.short_name = liveMan.short_name; man.description = liveMan.description;
write(path.join(APP, 'manifest.webmanifest'), JSON.stringify(man, null, 2) + '\n');

console.log('✅ app/ is now HLEP DPR ' + version + ' (from beta/). Live backend kept: ' + api.slice(0, 60) + '…');
console.log('   Before publishing: the LIVE Apps Script project must run backend w2.0 or later.');

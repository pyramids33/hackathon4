const fs = require('fs');

const { BaseWallet } = require('../wallet.js');
const { OpenSqliteFile } = require('../dbutil.js');

let testnethost = '159.65.152.200';
let dbfilename = './data/sync_headers_mainnet.db';

let resetdb = process.argv.length > 2 && process.argv[2] === '1';

if (!fs.existsSync(dbfilename) || resetdb) {
    try { 
        console.log('resetting db');
        let db = BaseWallet.initDb('mainnet', Date.now());
        fs.writeFileSync(dbfilename, db.serialize());
    } catch (error) { 
        console.log(error); process.exit(1); 
    }
}

let db = OpenSqliteFile(dbfilename)
let wallet = new BaseWallet(db);

let chainTip = wallet.headers.getChainTips()[0];
console.log('chaintip', chainTip.height, chainTip.hash);

wallet.syncHeaders(testnethost, function (report) {
    let chainTip = wallet.headers.getChainTips()[0];
    console.log('received', report.headerCount, 'headers, processed in', (report.processingTime/1000).toFixed(2), 'seconds');
    console.log('chaintip', chainTip.height, chainTip.hash);
});
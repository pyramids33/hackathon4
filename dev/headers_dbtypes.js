const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const bsv = require('bsv');
const sqlite3 = require('better-sqlite3');

// changed the datatype to blob 

const HeadersDb = require('./headersdb.js');

let dbfilename = './data/test_blobtype.db';

let resetdb = process.argv.length > 2 && process.argv[2] === '1';

if (fs.existsSync(dbfilename) && resetdb) {
    try { 
        console.log('resetting db');
        fs.unlinkSync(dbfilename); 
    } catch (error) { 
        console.log(error); process.exit(1); 
    }
}

let db = HeadersDb(dbfilename);

let db2 = new sqlite3('./data/testnet_p2p_text.db');
db2.pragma('journal_mode = WAL');
process.on('exit', function () { db2.close(); });

let getTextRows = db2.prepare('select * from headers where height > ? and height < ? order by height desc');

let dt = Date.now();
let n = true;
while (n) {
db.transaction(function () {
    let height = db.db.prepare('select max(height) as height from headers').get().height || 0;
    
    console.log(height, ((Date.now()-dt)/1000).toFixed(2));
    dt = Date.now();

    let textrows = getTextRows.all(height, height + 10000);

    if (textrows.length === 0) n = false;

    textrows.forEach(function (item) {
        db.addHeader(
            Buffer.from(item.hash,'hex'),
            item.height,
            item.version,
            Buffer.from(item.prevblock,'hex'),
            Buffer.from(item.merkleroot,'hex'),
            item.time,
            item.bits,
            item.nonce
        );
    });
});
}

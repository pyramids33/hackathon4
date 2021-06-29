const fs = require('fs');
const bsv = require('bsv');

const HeadersDb = require('./headersdb.js');

function blockHeaderFromDbRow(row) {
    return new bsv.BlockHeader(
        row.version, 
        Buffer.from(row.prevblock),
        Buffer.from(row.merkleroot),
        row.time, 
        row.bits, 
        row.nonce);
}




try { fs.unlinkSync('testnet.db'); } catch (e) {} 

let db = HeadersDb('testnet.db');
let br = new bsv.Br(Buffer.from(fs.readFileSync('headers.txt').toString(), 'hex'));

let headerCount = br.readVarIntNum();

db.transaction (function () {
    while (!br.eof()) {

        let header = bsv.BlockHeader.fromBr(br);
        br.readVarIntNum(); // dont need it

        let headerHash = bsv.Hash.sha256Sha256(header.toBuffer()).toString('hex');
        let prevHeaderRow = db.getByHash(header.prevBlockHashBuf.toString('hex'));
        let height = prevHeaderRow ? prevHeaderRow.height + 1 : 1;

        db.addHeader(
            headerHash, height, header.versionBytesNum, 
            header.prevBlockHashBuf.toString('hex'), 
            header.merkleRootBuf.toString('hex'), 
            header.time, header.bits, header.nonce);

    }
});

let chainTips = db.getChainTips();

if (chainTips.length > 0) {
    let chainTip = chainTips[0];

    let blr = db.getBlockLocatorRows(chainTip);
    console.log(blr);
}



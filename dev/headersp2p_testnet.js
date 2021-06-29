const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const bsv = require('bsv');

const HeadersDb = require('./headersdb.js');
const Inbox = require('./inbox.js');

const protocolVersion = 70015;
const servicesFlags = 0;

let dbfilename = './data/testnet_p2p.db';

// testnet
let netMagicHex = 'f4e5f3f4';
let port = 18333;
let host = '70.114.25.192';

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

let genesisHeaderRow = db.getByHeight(0);

if (genesisHeaderRow[0] === undefined) {
    // add the testnet genesis header
    db.addHeader(
        '43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea330900000000',0,1,null,
        '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',1296688602,0x1d00ffff,414098458);
}

let inbox = Inbox({ netMagicHex });
let socket = new net.Socket();

inbox.emitter.on('message', function (msgIn) {
    console.log('@', msgIn.command, msgIn.payload.length, 'bytes', msgIn.payload.slice(0,50).toString('hex'));

    if (msgIn.command === 'verack') {
        let msgOut = createMessageBuf('verack', Buffer.alloc(0));
        socket.write(msgOut);

        sendGetHeaders();
    } else if (msgIn.command === 'headers') {
        let report = processHeadersPacket(msgIn.payload);
        
        let chainTip = db.getChainTips()[0];
        console.log('chaintip', chainTip.height, chainTip.hash);
        console.log('received', report.headerCount, 'headers, processed in', (report.processingTime/1000).toFixed(2), 'seconds');

        if (report.headerCount > 0) {
            setTimeout(sendGetHeaders, 100);
        } else {
            socket.destroy();
            process.exit(1);
        }
    } else if (msgIn.command === 'ping') {
        let msgOut = createMessageBuf('pong', msgIn.payload);
        socket.write(msgOut);
    }
});

function sendGetHeaders() {
    let blockLocatorRows = db.getBlockLocatorRows(db.getChainTips()[0]);
    let message = createMessageBuf('getheaders', createGetHeadersMessageBuffer(blockLocatorRows));
    socket.write(message);
}

function writeAddr (bw, addr) {
    if (addr === undefined) {
        bw.write(Buffer.alloc(26));
        return;
    }

    bw.writeUInt64LEBn(addr.services);

    addr.ip.v6.split(':').forEach(function(item) {
        bw.write(Buffer.from(item, 'hex'));
    });

    bw.writeUInt16BE(addr.port);
}

function createVersionMessageBuffer (height, addrRecv, addrFrom) {

    let bw = new bsv.Bw();
    bw.writeUInt32LE(protocolVersion);
    bw.writeUInt64LEBn(new bsv.Bn(servicesFlags));
    bw.writeUInt64LEBn(new bsv.Bn(Math.round(Date.now() / 1000)));

    writeAddr(bw, addrRecv);
    writeAddr(bw, addrFrom);

    bw.write(crypto.randomBytes(8));

    bw.writeUInt8(0x00);
    //bw.writeVarIntNum(subversionBuffer.length); 
    //bw.write(subversionBuffer);
    bw.writeUInt32LE(height);
    bw.writeUInt8(0x00);

    return bw.toBuffer();
}

function createGetHeadersMessageBuffer (blockLocatorRows) {

    let bw = new bsv.Bw();
    bw.writeUInt32LE(protocolVersion);
    bw.writeVarIntNum(blockLocatorRows.length);
    
    blockLocatorRows.forEach(function (item) {
        bw.write(Buffer.from(item.hash,'hex'));
    });

    bw.write(Buffer.alloc(32));

    return bw.toBuffer();
}

function createMessageBuf (command, payload) {
    let bw = new bsv.Bw();
    bw.write(Buffer.from(netMagicHex,'hex'));
    bw.write(Buffer.from(command, 'ascii'));
    bw.write(Buffer.alloc(12-command.length));
    bw.writeUInt32LE(payload.length);
    bw.write(bsv.Hash.sha256Sha256(payload).slice(0, 4));
    bw.write(payload);
    return bw.toBuffer();
}

function processHeadersPacket (headersBuf) {
    
    let report = {
        headerCount: 0,
        processingTime: 0
    };

    let br = new bsv.Br(headersBuf);

    let headerCount = br.readVarIntNum();
    report.headerCount = headerCount;

    let dt = Date.now();

    db.transaction (function () {
        while (!br.eof()) {

            let header = bsv.BlockHeader.fromBr(br);
            br.readVarIntNum(); // transaction count, dont need it

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

    report.processingTime = (Date.now()-dt);

    return report;
}

socket.on('error', function (error) {
    console.error('error', error);
    socket.destroy();
    process.exit(1);
});

socket.on('end', function () {
    console.log('disconnected');
    socket.destroy();
    process.exit(1);
});

socket.on('data', function(data) {
    //console.log('data', data.length, 'bytes', data.slice(0,50).toString('hex'));
    inbox.update(data);
});

socket.on('connect', function() {
    console.log('connect');
    let height = db.getChainTips()[0].height;
    let payload = createVersionMessageBuffer(height);
    let message = createMessageBuf('version', payload);
    socket.write(message);
});

console.log('connect to', host, port);
socket.connect(port, host);


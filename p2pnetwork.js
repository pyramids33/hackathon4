const net = require('net');
const crypto = require('crypto');
const bsv = require('bsv');

const Inbox = require('./inbox.js');

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

function createVersionMessageBuffer (protocolVersion, servicesFlags, height, addrRecv, addrFrom) {

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

function createGetHeadersMessageBuffer (protocolVersion, blockLocatorRows) {

    let bw = new bsv.Bw();
    bw.writeUInt32LE(protocolVersion);
    bw.writeVarIntNum(blockLocatorRows.length);
    
    blockLocatorRows.forEach(function (item) {
        bw.write(Buffer.from(item.hash,'hex'));
    });

    bw.write(Buffer.alloc(32));

    return bw.toBuffer();
}

function createMessageBuf (netMagicHex, command, payload) {
    let bw = new bsv.Bw();
    bw.write(Buffer.from(netMagicHex,'hex'));
    bw.write(Buffer.from(command, 'ascii'));
    bw.write(Buffer.alloc(12-command.length));
    bw.writeUInt32LE(payload.length);
    bw.write(bsv.Hash.sha256Sha256(payload).slice(0, 4));
    bw.write(payload);
    return bw.toBuffer();
}

function SyncHeaders (host, port, protocolVersion, netMagic, headersDb, onReport) {

    let servicesFlags = 0;
    let netMagicHex = netMagic.toString(16);
    let inbox = Inbox({ netMagicHex });
    let socket = new net.Socket();

    function sendGetHeaders() {
        let blockLocatorRows = headersDb.getBlockLocatorRows(headersDb.getChainTips()[0]);
        let message = createMessageBuf(netMagicHex, 'getheaders', createGetHeadersMessageBuffer(protocolVersion, blockLocatorRows));
        socket.write(message);
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

        headersDb.transaction (function () {
            while (!br.eof()) {

                let header = bsv.BlockHeader.fromBr(br);
                br.readVarIntNum(); // transaction count, dont need it

                let headerHash = bsv.Hash.sha256Sha256(header.toBuffer()).toString('hex');
                let prevHeaderRow = headersDb.getByHash(header.prevBlockHashBuf.toString('hex'));
                let height = prevHeaderRow ? prevHeaderRow.height + 1 : 1;

                headersDb.addHeader(
                    headerHash, height, header.versionBytesNum, 
                    header.prevBlockHashBuf.toString('hex'), 
                    header.merkleRootBuf.toString('hex'), 
                    header.time, header.bits, header.nonce
                );
            }
        });

        report.processingTime = (Date.now()-dt);

        return report;
    }

    inbox.emitter.on('message', function (msgIn) {

        if (msgIn.command === 'verack') {
            let msgOut = createMessageBuf(netMagicHex, 'verack', Buffer.alloc(0));
            socket.write(msgOut);
            sendGetHeaders();
        } else if (msgIn.command === 'headers') {
            let report = processHeadersPacket(msgIn.payload);
            
            onReport(report);
            
            if (report.headerCount > 0) {
                sendGetHeaders();
            } else {
                socket.destroy();
            }
        } else if (msgIn.command === 'ping') {
            let msgOut = createMessageBuf(netMagicHex, 'pong', msgIn.payload);
            socket.write(msgOut);
        }
    });

    socket.on('error', function (error) {
        socket.destroy();
        throw error;
    });

    socket.on('end', function () {
        socket.destroy();
    });

    socket.on('data', function(data) {
        inbox.update(data);
    });

    socket.on('connect', function() {
        let height = headersDb.getChainTips()[0].height;
        let payload = createVersionMessageBuffer(protocolVersion, servicesFlags, height);
        let message = createMessageBuf(netMagicHex, 'version', payload);
        socket.write(message);
    });

    socket.connect(port, host);
}

module.exports = SyncHeaders
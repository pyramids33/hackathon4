const net = require('net');
const crypto = require('crypto');
const bsv = require('bsv');
const Inbox = require('./inbox.js');
const fs = require('fs');

const protocolVersion = 70015;
const servicesFlags = 0;
const subversion = '/alien:0.1/';
const subversionBuffer = Buffer.from(subversion, 'ascii');
const relayFlag = 0;


// let netMagicHex = 'dab5bffa';
// let port = 12765;
// let host = '127.0.0.1';

// let headers = [
//     { hash: '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206' }
// ];

// testnet
let netMagicHex = 'f4e5f3f4';
let port = 18333;
let host = '70.114.25.192';

let headers = [
    { hash: '000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943' }
];


// let hosts = [ '165.227.37.47', '157.230.96.95', '167.99.91.85' ]; // bitcoinsv.io
//let hosts = [ '138.68.156.46' ]; // cascharia.com
//let hosts = [ '70.114.25.192' ]; // bitcoin cloud

// main
//let netMagicHex = 'e3e1f3e8';
//let port =  8333;
//let hosts = [ '139.59.67.18', '157.230.161.213', '68.183.42.63', '68.183.207.240' ]; // cascharia.com
//let host = hosts[0];

let inbox = Inbox({ netMagicHex });
let socket = new net.Socket();

inbox.emitter.on('message', function (message) {
    console.log(message.command, message.payload.slice(0,50).toString());

    if (message.command === 'verack') {
        let message = createMessageBuf('verack', Buffer.alloc(0));
        socket.write(message);

        message = createMessageBuf('getheaders', createGetHeadersMessageBuffer());
        socket.write(message);
    } else if (message.command === 'headers') {
        let ws = fs.createWriteStream('headers.txt');
        ws.end(message.payload.toString('hex'), function () {
            console.log('wrote file')
        });
    }
});

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

function createVersionMessageBuffer (startHeight, addrRecv, addrFrom) {

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
    bw.writeUInt32LE(0);
    bw.writeUInt8(0x00);

    return bw.toBuffer();
}

function createGetHeadersMessageBuffer () {

    let blockLocator = [headers[0].hash];

    let bw = new bsv.Bw();
    bw.writeUInt32LE(protocolVersion);
    bw.writeVarIntNum(blockLocator.length);
    
    blockLocator.forEach(function (item) {
        bw.write(Buffer.from(item));
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
    let payload = createVersionMessageBuffer();
    let message = createMessageBuf('version', payload);
    socket.write(message);
});

console.log('connect to', host, port);
socket.connect(port, host);


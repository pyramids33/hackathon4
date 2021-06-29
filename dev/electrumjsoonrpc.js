const net = require('net');

let host = "sv.usebsv.com";
let port = "50001";

let socket = new net.Socket();

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
    console.log('data', data.toString());
});

socket.on('connect', function() {
    console.log('connected');

    let payload = {
        jsonrpc: '2.0',
        method: 'blockchain.block.headers',
        params: [ 600000, 10, 0 ],
        id: Date.now().toString()
    }
    socket.write(Buffer.from(JSON.stringify(payload)+'\n'));
});

console.log('connect to', host, port);
socket.connect(port, host);

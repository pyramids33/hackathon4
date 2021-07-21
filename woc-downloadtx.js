let https = require('https');

let txid = process.argv.length > 2 ? process.argv[2] : undefined;

if (txid === undefined) {
    console.log('provide txid string');
}

let network = process.argv.length > 3 ? process.argv[3] : 'main';

let url = `https://api.whatsonchain.com/v1/bsv/${network}/tx/${txid}/hex`;

https.request(url, function(response) {
    let str = '';

    response.on('data', function (chunk) {
        str += chunk;
    });

    response.on('end', function () {
        process.stdout.write(Buffer.from(str,'hex'));
    });
}).end();
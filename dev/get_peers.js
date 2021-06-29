const dns = require('dns');

dns.resolve('testnet-seed.bitcoincloud.net', function(err, ips) {
    if (err) {
        console.log(err);return;
    }
    console.log(ips);
});
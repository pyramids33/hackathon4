const { makeProgram, BaseWallet, getWallet, initWallet } = require('../wallet.js');

let db = initWallet('testnet', Date.now());
let wallet = getWallet(db);

console.log(wallet.db.prepare('select * from _walletmeta').all())
console.log(wallet.db.prepare('select * from hdkeys').all())
console.log(wallet.db.prepare('select * from headers').all())

let network = wallet.getNetwork();

let hdkey = network.Bip32.fromString('tprv8ZgxMBicQKsPdQwgeaFv9UifwzBGBYRiY9VVuLcZciZUxAecwkZGwLpf23pezh1U6b4v49c366tHskFVuDf7sEvtp9y7YRSzKDzZ2iLEH6t');
wallet.hdkeys.addHDKey('test', hdkey.toBuffer());

//let hdkeyinfo = wallet.hdkeys.nextIndex('test')

let script = wallet.receiveP2PKH('test');
console.log(script.toString());

let chainTip = wallet.headers.getChainTips()[0];
console.log('chaintip', chainTip.height, chainTip.hash);

wallet.syncHeaders(function (report) {
    let chainTip = wallet.headers.getChainTips()[0];
    console.log('received', report.headerCount, 'headers, processed in', (report.processingTime/1000).toFixed(2), 'seconds');
    console.log('chaintip', chainTip.height, chainTip.hash);
});
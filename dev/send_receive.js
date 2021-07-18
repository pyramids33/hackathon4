const bsv = require('bsv');

const { makeProgram, BaseWallet, getWallet, initWallet } = require('../wallet.js');
const P2PKH = require('../p2pkh.js');

let db = initWallet('mainnet', Date.now());
let wallet = getWallet(db);
let network = wallet.getNetwork();

let txBuf = Buffer.from('0100000001b22e80d2350b900f3070bd24adfcca0cdbdd535e613e7967ab99e6317bf4e4a3000000006a473044022075feae'
                     +'90bba035da04ad29ffcf4233175aa5b7c4ec400080b238cb2d2865977d022068e7feeccc93066e7d3ab2d18c05028f3a4a02'
                     +'31bd8fbc4908033b31ba73cac54121022fd0fd0f1a9f0d257a536ad86fed509d0bce2e2fb1c79c8cfdb6702c0cfa37baffff'
                     +'ffff02e8030000000000001976a914788eea766a8c36bcfbdb331eb8bd02bec5954aec88acdfbe0000000000001976a91474'
                     +'6a05aae81cf30091cb6d821b0dbf83005d334e88ac00000000','hex');

let hdkey = network.Bip32.fromString('xprv9s21ZrQH143K4ZusTkLzYGA5XbJWf27w1awLgPPHj1FZvBDPGQyiSFQd7VjEEhweEVcQDMpUiVmMWPRBkpNjVdu92oD3kA4GUBuy9gdmhmq');
wallet.hdkeys.addHDKey('test', hdkey.toBuffer());

let script = P2PKH.receive(wallet.scripts, wallet.hdkeys, 'test', wallet.getNetwork());

console.log(network.Address.fromTxOutScript(script).toString());
console.log(wallet.scripts.getAllScripts());

let tx = bsv.Tx.fromBuffer(txBuf);

let report = wallet.addTransaction(tx, false);

console.log(report);


let unlockScript = P2PKH.spend(wallet.scripts, wallet.hdkeys, tx.txOuts[0], wallet.getNetwork());

console.log(unlockScript.script.toString());
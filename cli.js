const fs = require('fs');
const commander = require('commander');
const bsv = require('bsv');
const sqlite3 = require('better-sqlite3');

const Wallet = require('./wallet.js');
const Headers = require('./headers.js');
const P2PKH = require('./p2pkh.js');
const TxOutputs = require('./txoutputs.js');
const Transactions = require('./transactions.js');





let program = makeProgram(wallet);

program.command('receive')
.description('receive')
.action (async (options, command) => {
    let db = OpenSqliteFile(command.parent.opts().target);
    let p2pkh = P2PKH(db);
    let address = p2pkh.generateReceiveAddress();
    console.log(address.toString());
});

program.parse()




        
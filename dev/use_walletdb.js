const fs = require('fs');
const bsv = require('bsv');

const {
    HeadersDb,
    TxOutputsDb,
    HDKeysDb,
    TransactionsDb,
    Transactor,
    OpenSqliteFile
} = require('../database/index.js');

let tx1 = Buffer.from('0100000001b22e80d2350b900f3070bd24adfcca0cdbdd535e613e7967ab99e6317bf4e4a3000000006a473044022075feae'
                     +'90bba035da04ad29ffcf4233175aa5b7c4ec400080b238cb2d2865977d022068e7feeccc93066e7d3ab2d18c05028f3a4a02'
                     +'31bd8fbc4908033b31ba73cac54121022fd0fd0f1a9f0d257a536ad86fed509d0bce2e2fb1c79c8cfdb6702c0cfa37baffff'
                     +'ffff02e8030000000000001976a914788eea766a8c36bcfbdb331eb8bd02bec5954aec88acdfbe0000000000001976a91474'
                     +'6a05aae81cf30091cb6d821b0dbf83005d334e88ac00000000','hex');

let dbfilename = './data/test_database.db';

let resetdb = process.argv.length > 2 && process.argv[2] === '1';

if (fs.existsSync(dbfilename) && resetdb) {
    try { 
        console.log('resetting db');
        fs.unlinkSync(dbfilename); 
    } catch (error) { 
        console.log(error); process.exit(1); 
    }
}

function P2PKHDb (db) {

    const psAddAddress = db.prepare('insert into p2pkh (address,publickey,hdkeyname,hdkeyindex,initialStatus) values (?,?,?,?,?) ');
    const psGetByAddress = db.prepare('select * from p2pkh where address = ?');
    
    function addAddress (address, publickey, hdkeyname, hdkeyindex, initialStatus) {
        return psAddAddress.run(address, publickey, hdkeyname, hdkeyindex, initialStatus);
    }

    function getByAddress (address) {
        return psGetByAddress.get(address);
    }

    function getSpendInfo (output, index, tx) {
        if (!output.script.isPubKeyHashOut()) return undefined;
        
        let addressinfo = psGetByAddress.get(output.script.toAddress());
        let hdkeyinfo = db.hdkeys.getHDKey(info.hdkeyname);
        let pkey = bsv.Bip32.fromBuffer(addressinfo.xprv).deriveChild(addressInfo.n,true).privateKey;
        
        let script = new bsv.Script();
        script.writeOpCode(OpCode.OP_0) // blank signature
        script.writeBuffer(pubKey.toBuffer())

        return { 
            keys: [pkey],
            script
        }
    }

    return {
        addAddress,
        getByAddress,
        getSpendInfo
    }
}

P2PKHDb.updateSchema = function (db) {
    db.prepare('create table if not exists p2pkh (address blob, publickey blob, hdkeyname text, hdkeyindex int, initialStatus int)').run();
    db.prepare('create unique index if not exists p2pkh_address on p2pkh(address)').run();
}

// initialise wallet
const db = OpenSqliteFile(dbfilename);

TxOutputsDb.updateSchema(db);
HDKeysDb.updateSchema(db);
TransactionsDb.updateSchema(db);
P2PKHDb.updateSchema(db);


const txoutputs = TxOutputsDb(db);
const hdkeys = HDKeysDb(db);
const transactions = TransactionsDb(db);
const p2pkh = P2PKHDb(db)

// initialise hdkey
let hdkeyinfo = hdkeys.getHDKey();

if (hdkeyinfo === undefined) {
    console.log('adding default key');
    let hdkey = bsv.Bip32.fromString('xprv9s21ZrQH143K4ZusTkLzYGA5XbJWf27w1awLgPPHj1FZvBDPGQyiSFQd7VjEEhweEVcQDMpUiVmMWPRBkpNjVdu92oD3kA4GUBuy9gdmhmq');
    hdkeys.addHDKey('default', hdkey.toBuffer());
    hdkeyinfo = hdkeys.getHDKey();
} 

let hdkey = bsv.Bip32.fromBuffer(hdkeyinfo.xprv);

// generate receive address
hdkeyinfo = hdkeys.nextIndex();
let counter = hdkeyinfo.counter;
let privkey = hdkey.deriveChild(counter,true).privKey;
let pubkey = new bsv.PubKey().fromPrivKey(privkey);
let address = new bsv.Address().fromPubKey(pubkey);

console.log(privkey.toString(), pubkey.toString(), address.toString());

p2pkh.addAddress(address.toBuffer(), pubkey.toBuffer(), hdkeyinfo.name, counter, 0);

// import transaction
let report = [];

let tx = bsv.Tx.fromBuffer(tx1);

tx.txOuts.forEach(function (output, index) {
    console.log(output.valueBn.toNumber(), output.script.toString());

    if (!output.script.isPubKeyHashOut()) {
        return;
    }
    
    let address = bsv.Address.fromTxOutScript(output.script);
    let addressinfo =  p2pkh.getByAddress(address.toBuffer())
    
    if (addressinfo === undefined) {
        return;
    }

    report.push([index, output.valueBn.toNumber(), 'p2pkh', addressinfo.initialStatus]);

    txoutputs.addTxOutput(tx.hash(), index, output.valueBn.toNumber(), 'p2pkh', addressinfo.initialStatus);
});

console.log(report);
    
let utxos = db.prepare('select * from txoutputs_unspent').all();

console.log(utxos);



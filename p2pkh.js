const bsv = require('bsv');

const TXO_TYPE = 'p2pkh';

function P2PKHDb (db, network, hdkeysDb) {

    const psAddAddress = db.prepare('insert into p2pkh (address,publickey,hdkeyname,hdkeyindex,initialStatus) values (?,?,?,?,?) ');
    const psGetByAddress = db.prepare('select * from p2pkh where address = ?');
    
    function addAddress (address, publickey, hdkeyname, hdkeyindex, initialStatus) {
        return psAddAddress.run(address, publickey, hdkeyname, hdkeyindex, initialStatus);
    }

    function getByAddress (address) {
        return psGetByAddress.get(address);
    }

    function getAddressInfo (output) {
        if (!output.script.isPubKeyHashOut()) {
            return;
        }
        
        let address = network.Address.fromTxOutScript(output.script);
        let addressinfo = getByAddress(address.toBuffer())
        
        if (addressinfo === undefined) {
            return;
        }

        return addressinfo;
    }

    function receive (hdkeyname) {
        let hdkeyinfo = hdkeysDb.nextIndex(hdkeyname);
        let counter = hdkeyinfo.counter;
        let privkey = network.Bip32.fromBuffer(hdkeyinfo.xprv).deriveChild(counter,true).privKey;
        let pubkey = bsv.PubKey.fromPrivKey(privkey);
        let address = network.Address.fromPubKey(pubkey);
        addAddress(address.toBuffer(), pubkey.toBuffer(), hdkeyinfo.name, counter, 0);
        return address.toTxOutScript();
    }
    
    function handleTx (tx, callback) {
        tx.txOuts.forEach(function (output, index) {
            let addressinfo = getAddressInfo(output, index);
            if (addressinfo) {
                callback(tx, index, output.valueBn, TXO_TYPE, addressinfo.initialStatus);
            }
        });
    }
    
    function handleSpend (output) {
        if (!output.script.isPubKeyHashOut()) return undefined;
        
        let addressinfo = getByAddress.get(output.script.toAddress());
        let hdkeyinfo = hdkeysDb.getHDKey(addressinfo.hdkeyname);
        let pkey = bsv.Bip32.fromBuffer(hdkeyinfo.xprv).deriveChild(addressInfo.n,true).privateKey;
        
        let script = new bsv.Script();
        script.writeOpCode(OpCode.OP_0);
        script.writeBuffer(pubKey.toBuffer());
    
        return { 
            keys: [pkey],
            script
        }
    }

    return {
        addAddress,
        getByAddress,
        getAddressInfo,
        receive,
        handleTx,
        handleSpend
    }
}

function updateSchema (db) {
    db.prepare('create table if not exists p2pkh (address blob, publickey blob, hdkeyname text, hdkeyindex int, initialStatus int)').run();
    db.prepare('create unique index if not exists p2pkh_address on p2pkh(address)').run();
}

module.exports = {
    updateSchema,
    api: P2PKHDb,
    TXO_TYPE
}
const bsv = require('bsv');

const TXO_TYPE = 'p2pkh';

function receive (scriptsDb, hdkeysDb, hdkeyname, network) {
    let hdkeyinfo = hdkeysDb.nextIndex(hdkeyname);
    let counter = hdkeyinfo.counter;
    let privKey = network.Bip32.fromBuffer(hdkeyinfo.xprv).deriveChild(counter,true).privKey;
    let pubKey = bsv.PubKey.fromPrivKey(privKey);
    let address = network.Address.fromPubKey(pubKey);
    let script = address.toTxOutScript();
    let scriptHash = bsv.Hash.sha256(script.toBuffer());
    let data = { hdkey: hdkeyinfo.name, counter };
    scriptsDb.addScript(scriptHash, TXO_TYPE, 1, Buffer.from(JSON.stringify(data)));
    return script;
}

function spend (tx, nIn, scriptData, output, hashCache, hdkeysDb, network) {
    if (!output.script.isPubKeyHashOut()) return undefined;
    
    let hdkeyinfo = hdkeysDb.getHDKey(scriptData.hdkey);
    let privKey = network.Bip32.fromBuffer(hdkeyinfo.xprv).deriveChild(scriptData.counter,true).privKey;
    let pubKey = bsv.PubKey.fromPrivKey(privKey);

    let keyPair = network.KeyPair.fromPrivKey(privKey);

    let sig = tx.sign(
        keyPair, 
        bsv.Sig.SIGHASH_ALL | bsv.Sig.SIGHASH_FORKID, 
        nIn, 
        output.script, 
        output.valueBn, 
        bsv.Tx.SCRIPT_ENABLE_SIGHASH_FORKID, hashCache);

    let script = new bsv.Script();
    script.writeBuffer(sig.toTxFormat());
    script.writeBuffer(pubKey.toBuffer());

    return script;
}

function SpendHandler (hdkeysDb, network) {
    return {
        // generate the unlocking script
        getUnlockScript: function (tx, nIn, scriptData, output, hashCache={}) {
            return spend(tx, nIn, scriptData, output, hashCache, hdkeysDb, network);
        },
        // calculate the size of the unlocking script
        calculateSize: function (scriptData) {
            const sigSize = 1 + 1 + 1 + 1 + 32 + 1 + 1 + 32 + 1 + 1;
            const pubKeySize = 1 + 1 + 33;
            return sigSize + pubKeySize;
        }
    }
}

module.exports = {
    TXO_TYPE,
    receive,
    spend,
    SpendHandler
}
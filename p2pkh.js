const bsv = require('bsv');
const OpCode = bsv.OpCode;

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

function spend (scriptsDb, hdkeysDb, output, network) {
    if (!output.script.isPubKeyHashOut()) return undefined;
    
    let scriptHash = bsv.Hash.sha256(output.script.toBuffer());
    let scriptInfo = scriptsDb.getScriptByHash(scriptHash);
    let scriptData = JSON.parse(scriptInfo.data.toString());
    
    let hdkeyinfo = hdkeysDb.getHDKey(scriptData.hdkey);
    let privKey = network.Bip32.fromBuffer(hdkeyinfo.xprv).deriveChild(scriptData.counter,true).privKey;
    console.log(privKey);
    let pubKey = bsv.PubKey.fromPrivKey(privKey);

    let script = new bsv.Script();
    script.writeOpCode(OpCode.OP_0);
    script.writeBuffer(pubKey.toBuffer());

    return { 
        keys: [privKey],
        script
    }
}

function SpendHandler (scriptsDb, hdkeysDb, network) {
    return function (output) {
        return spend(scriptsDb, hdkeysDb, output, network);
    }
}

module.exports = {
    TXO_TYPE,
    receive,
    spend,
    SpendHandler
}
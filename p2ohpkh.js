const bsv = require('bsv');
const Bw = bsv.Bw;
const OpCode = bsv.OpCode;

TXO_TYPE = 'p2ohpkh'

class OrderItem extends bsv.Struct {
    constructor (
        itemCode = '',
        description = '',
        price = 0
    ) {
        super({
            itemCode,
            description,
            price
        })
    }

    fromJSON (json) {
        this.fromObject({
            itemCode: json.itemCode,
            description: json.description,
            price: json.price
        });
        return this;
    }

    toJSON () {
        return {
            itemCode: this.itemCode,
            description: this.description,
            price: this.price
        }
    }

    fromBr (br) {
        let itemCodeLength = br.readVarIntNum();
        this.itemCode = br.read(itemCodeLength).toString('utf8');

        let descLength = br.readVarIntNum();
        this.description = br.read(descLength).toString('utf8');

        this.price = br.readUInt64LEBn().toNumber();

        return this;
    }

    toBw (bw) {
        if (!bw) {
            bw = new Bw();
        }

        let itemCodeBuf = Buffer.from(this.itemCode);

        bw.writeVarIntNum(itemCodeBuf.length);
        bw.write(itemCodeBuf);

        let descBuf = Buffer.from(this.description);

        bw.writeVarIntNum(descBuf.length);
        bw.write(descBuf);

        bw.writeUInt64LEBn(new bsv.Bn(this.price));

        return bw;
    }
}

class Order extends bsv.Struct {

    constructor (
        dateNum = 0,
        vendor = '',
        vendorPubKey = new bsv.PubKey(),
        destination = '',
        nonceBuf = Buffer.alloc(16),
        items = []
    ) {
        super({
            dateNum,
            vendor,
            vendorPubKey,
            destination,
            nonceBuf,
            items
        })
    }

    total () {
        return this.items.reduce((p,c) => p + c.price, 0);
    }

    getOrderPubKey () {
        let nonceBn = bsv.Bn().fromBuffer(this.nonceBuf);
        return new bsv.PubKey(bsv.Point.getG().mul(nonceBn).add(this.vendorPubKey.point), this.vendorPubKey.compressed);
    }

    getOrderPrivKey (vendorPrivKey) {
        let nonceBn = bsv.Bn().fromBuffer(this.nonceBuf);
        return new bsv.PrivKey(vendorPrivKey.bn.add(nonceBn), vendorPrivKey.compressed, vendorPrivKey.Constants);
    }

    fromJSON (json) {
        const items = [];
        json.items.forEach(function (item) {
            items.push(new OrderItem().fromJSON(item));
        });
        this.fromObject({
            dateNum: json.dateNum,
            vendor: json.vendor,
            vendorPubKey: bsv.PubKey.fromString(json.vendorPubKey),
            destination: json.destination,
            nonceBuf: Buffer.from(json.nonceBuf,'hex'),
            items
        });
        return this
    }

    toJSON () {
        const items = [];
        this.items.forEach(function (item) {
            items.push(item.toJSON());
        });
        return {
            dateNum: this.dateNum,
            vendor: this.vendor,
            vendorPubKey: this.vendorPubKey.toString(),
            destination: this.destination,
            nonceBuf: this.nonceBuf.toString('hex'),
            items
        }
    }

    fromBr (br) {
        this.dateNum = br.readUInt64LEBn().toNumber();
         
        let vendorLen = br.readVarIntNum();
        this.vendor = br.read(vendorLen).toString('utf8');

        let vendorPubKeyLen = br.readVarIntNum();
        this.vendorPubKey = bsv.PubKey.fromBuffer(br.read(vendorPubKeyLen));

        let destLen = br.readVarIntNum();
        this.destination = br.read(destLen).toString('utf8');

        this.nonceBuf = br.read(16);

        let itemCount = br.readVarIntNum();
        
        this.items = [];
        
        for (let i = 0; i < itemCount; i++) {
            this.items.push(new OrderItem().fromBr(br));
        }

        return this;
    }

    toBw (bw) {
        if (!bw) {
            bw = new Bw();
        }

        bw.writeUInt64LEBn(new bsv.Bn(this.dateNum));

        let vendorBuf = Buffer.from(this.vendor);
        bw.writeVarIntNum(vendorBuf.length);
        bw.write(vendorBuf);

        let vendorPubKeyBuf = this.vendorPubKey.toBuffer();
        bw.writeVarIntNum(vendorPubKeyBuf.length);
        bw.write(vendorPubKeyBuf);

        let destBuf = Buffer.from(this.destination);
        bw.writeVarIntNum(destBuf.length);
        bw.write(destBuf);

        bw.write(this.nonceBuf);
        bw.writeVarIntNum(this.items.length);

        for (let i = 0; i < this.items.length; i++) {
            this.items[i].toBw(bw);
        }

        return bw;
    }
}

function getScriptPubKey (orderHash2, orderAddress, refundAddress) {

    let scriptPubKey = new bsv.Script();
    // check order hash
    scriptPubKey.writeOpCode(OpCode.OP_SHA256)
    scriptPubKey.writeBuffer(orderHash2)
    scriptPubKey.writeOpCode(OpCode.OP_EQUALVERIFY)

    // check pubkey is either the p1 or p2 pubkey
    scriptPubKey.writeOpCode(OpCode.OP_DUP)
    scriptPubKey.writeOpCode(OpCode.OP_DUP)
    scriptPubKey.writeOpCode(OpCode.OP_HASH160)
    scriptPubKey.writeBuffer(orderAddress.hashBuf)
    scriptPubKey.writeOpCode(OpCode.OP_EQUAL)
    scriptPubKey.writeOpCode(OpCode.OP_SWAP)
    scriptPubKey.writeOpCode(OpCode.OP_HASH160)
    scriptPubKey.writeBuffer(refundAddress.hashBuf)
    scriptPubKey.writeOpCode(OpCode.OP_EQUAL)
    
    scriptPubKey.writeOpCode(OpCode.OP_BOOLOR)
    scriptPubKey.writeOpCode(OpCode.OP_TRUE)
    scriptPubKey.writeOpCode(OpCode.OP_EQUALVERIFY)
    scriptPubKey.writeOpCode(OpCode.OP_CHECKSIG)

    return scriptPubKey;
}

function startOrder (order, scriptsDb, hdkeysDb, hdkeyname, network) {

    // generate orderPubKey2 from from p2PubKey + nonce
    let orderPubKey = order.getOrderPubKey();
    let orderAddress = network.Address.fromPubKey(orderPubKey);

    let orderBuf = order.toBuffer();
    let orderHash1 = bsv.Hash.sha256(orderBuf);
    let orderHash2 = bsv.Hash.sha256(orderHash1);

    let hdkeyinfo = hdkeysDb.nextIndex(hdkeyname);
    let counter = hdkeyinfo.counter;
    let refundPrivKey = network.Bip32.fromBuffer(hdkeyinfo.xprv).deriveChild(counter,true).privKey;
    let refundPubKey = bsv.PubKey.fromPrivKey(refundPrivKey);
    let refundAddress = network.Address.fromPubKey(refundPubKey);

    let scriptData = { hdkey: hdkeyinfo.name, counter, orderHash1: orderHash1.toString('hex') };

    let script = getScriptPubKey(orderHash2, orderAddress, refundAddress);
    let scriptHash = bsv.Hash.sha256(script.toBuffer());

    scriptsDb.addScript(scriptHash, TXO_TYPE, 2, Buffer.from(JSON.stringify(scriptData)));

    return script;
}

//
// returns the signed transaction
// spend the order, if you are the vendor, provide your vendor private key
// if you are the customer, cancel this order by spending it to yourself with the refund key
//
function spendOrder (order, orderTx, vendorPrivKey, refundPrivKey, changeScript, network) {

    let orderHash1 = bsv.Hash.sha256(order.toBuffer());
    let orderHash2 = bsv.Hash.sha256(orderHash1);
    let orderTxHash = orderTx.hash();

    let orderTxOut = orderTx.txOuts.find(function (txOut) {
        return txOut.script.chunks[6].buf.compare(bsv.Hash.sha256Ripemd160(order.getOrderPubKey().toBuffer())) === 0
            && txOut.script.chunks[1].buf.compare(orderHash2) === 0
    });

    if (orderTxOut === undefined) {
        throw new error('Order script not found');
    }

    let sigKeyPair;

    if (vendorPrivKey) {
        let sigPrivKey = order.getOrderPrivKey(vendorPrivKey);
        sigKeyPair = network.KeyPair.fromPrivKey(sigPrivKey);
    } else if (refundPrivKey) {
        sigKeyPair = network.KeyPair.fromPrivKey(refundPrivKey);

        if (orderTxOut.script.chunks[10].buf.compare(bsv.Hash.sha256Ripemd160(sigKeyPair.pubKey.toBuffer())) !== 0) {
            throw new error('Order script (refund key) not found');
        }
    }

    let tx = new bsv.Tx();
    tx.addTxOut(new bsv.Bn(0), changeScript);
    tx.addTxIn(orderTxHash, 0, new bsv.Script());

    let estimatedSize = tx.toBuffer().length + 140;
    let estimatedFee = new bsv.Bn(Math.ceil(estimatedSize / 1000 * network.constants.TxBuilder.feePerKbNum));
    let changeAmount = orderTxOut.valueBn.sub(estimatedFee);

    tx.txOuts[0].valueBn = changeAmount;

    let sig = tx.sign(
        sigKeyPair, 
        bsv.Sig.SIGHASH_ALL | bsv.Sig.SIGHASH_FORKID, 
        0, 
        orderTxOut.script, 
        orderTxOut.valueBn, 
        bsv.Tx.SCRIPT_ENABLE_SIGHASH_FORKID, {});

    let scriptSig = new bsv.Script();
    scriptSig.writeBuffer(sig.toTxFormat());
    scriptSig.writeBuffer(sigKeyPair.pubKey.toBuffer());
    scriptSig.writeBuffer(Buffer.from(orderHash1,'hex'));

    tx.txIns[0].setScript(scriptSig);

    return tx;
}

function calculateScriptSigSize (scriptData) {
    const sigSize = 1 + 1 + 1 + 1 + 32 + 1 + 1 + 32 + 1 + 1;
    const pubKeySize = 1 + 1 + 33;
    const hashSize = 32;
    return sigSize + pubKeySize + hashSize;
}


module.exports = {
    Order,
    OrderItem,
    startOrder,
    spendOrder,
    calculateScriptSigSize
}
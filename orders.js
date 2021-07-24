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
        destination = '',
        nonceBuf = Buffer.alloc(0),
        items = []
    ) {
        super({
            dateNum,
            vendor,
            destination,
            nonceBuf,
            items
        })
    }

    total () {
        return this.items.reduce((p,c) => p + c.price, 0);
    }

    fromJSON (json) {
        const items = [];
        json.items.forEach(function (item) {
            items.push(new OrderItem().fromJSON(item));
        });
        this.fromObject({
            dateNum: json.dateNum,
            vendor: json.vendor,
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
            destination: this.destination,
            nonceBuf: this.nonceBuf.toString('hex'),
            items
        }
    }

    fromBr (br) {
        this.dateNum = br.readUInt64LEBn().toNumber();
         
        let vendorLen = br.readVarIntNum();
        this.vendor = br.read(vendorLen).toString('utf8');

        let destLen = br.readVarIntNum();
        this.destination = br.read(destLen).toString('utf8');

        this.nonceBuf = br.read(32);

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

function startOrderTx (order, p2PubKey, ordersDb, scriptsDb, hdkeysDb, hdkeyname, network) {

    // generate orderPubKey2 from from p2PubKey + nonce
    let nonceBn = bsv.Bn().fromBuffer(order.nonceBuf);
    let orderPubKey = new bsv.PubKey(bsv.Point.getG().mul(nonceBn).add(p2PubKey.point), p2PubKey.compressed);
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

    let orderTotal = order.total();

    ordersDb.addOrder(scriptHash, p2PubKey.toString(), order.vendor, order.dateNum, orderTotal, order.toBuffer());
    scriptsDb.addScript(scriptHash, TXO_TYPE, 2, Buffer.from(JSON.stringify(scriptData)));

    let tx = new bsv.Tx();
    tx.addTxOut(new bsv.Bn(orderTotal), script);
    return tx;
}

function spend (tx, nIn, scriptData, output, hashCache, hdkeysDb, network) {

    let hdkeyinfo = hdkeysDb.getHDKey(scriptData.hdkey);
    let privKey = network.Bip32.fromBuffer(hdkeyinfo.xprv).deriveChild(scriptData.counter,true).privKey;
    let pubKey = bsv.PubKey.fromPrivKey(privKey);

    let sig = tx.sign(
        keyPair, 
        bsv.Sig.SIGHASH_ALL | bsv.Sig.SIGHASH_FORKID, 
        nIn, 
        output.script, 
        output.valueBn, 
        bsv.Tx.SCRIPT_ENABLE_SIGHASH_FORKID, hashCache);

    // peer 2 generate scriptSig
    let scriptSig = new bsv.Script();
    scriptSig.writeBuffer(sig.toTxFormat());
    scriptSig.writeBuffer(pubKey.toBuffer());
    scriptSig.writeBuffer(Buffer.from(scriptData.orderHash1,'hex'));

    return scriptSig;
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
            const hashSize = 32;
            return sigSize + pubKeySize + hashSize;
        }
    }
}


function updateSchema (db) {
    db.prepare('create table if not exists orders (scripthash blob, pubkey blob, vendor text, orderdate int, total int, rawdata blob)').run();
    db.prepare('create index if not exists orders_scripthash on orders(scripthash)').run();
}

function OrdersDb (db) {

    const psAddOrder = db.prepare('insert into orders (scripthash, pubkey, vendor, orderdate, total, rawdata) values (?,?,?,?,?,?)');
    
    function addOrder (scripthash, pubkey, vendor, orderdate, total, rawdata) {
        return psAddOrder.run(scripthash, pubkey, vendor, orderdate, total, rawdata);
    }

    return {
        addOrder
    }
}


module.exports = {
    Order,
    OrderItem,
    startOrderTx,
    SpendHandler,
    api: OrdersDb,
    updateSchema
}
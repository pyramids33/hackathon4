const bsv = require('bsv');

function updateSchema (db) {
    db.prepare('create table if not exists merkleproofs (txhash blob, blockhash blob, proof blob)').run();
    db.prepare('create unique index if not exists merkleproofs_txhash_blockhash on merkleproofs (txhash, blockhash)').run();
}

function MerkleProofDb (db) {

    const psAddMerkleProof = db.prepare('insert into merkleproofs (txhash, blockhash, proof) values (?,?,?)');
    
    function addMerkleProof (txhash, blockhash, proof) {
        return psAddMerkleProof.run(txhash, blockhash, proof);
    }

    return {
        ps: { psAddMerkleProof },
        addMerkleProof
    }
}

class MerkleProofNode extends bsv.Struct {
    constructor (
        typeNum = 0,
        hashBuf = Buffer.alloc(0),
        indexVi = bsv.VarInt.fromNumber(0)
    ) {
        super({
            typeNum,
            hashBuf,
            indexVi
        });
    }

    fromJSON (json) {
        this.fromObject({
            typeNum: json.typeNum,
            hashBuf: Buffer.from(json.hashBuf, 'hex'),
            indexVi: new VarInt().fromJSON(json.indexVi),
        });
        return this;
    }

    toJSON () {
        return {
            typeNum: this.typeNum,
            hashBuf: this.hashBuf.toString('hex'),
            indexVi: this.indexVi.toJSON()
        };
    }

    fromBr (br) {
        this.typeNum = br.readUInt8();

        if (this.typeNum === 0) {
            this.hashBuf = br.read(32);
        } else if (this.typeNum === 2) {
            this.hashBuf = Buffer.alloc(0);
            this.indexVi = br.readVarIntNum();
        }

        return this;
    }

    toBw (bw) {
        if (!bw) {
            bw = new Bw();
        }

        bw.writeUInt8(this.typeNum);

        if (this.typeNum === 0) {
            bw.write(this.hashBuf);
        } else if (this.typeNum === 2) {
            bw.write(this.indexVi.buf);
        }

        return bw;
    }

}

class MerkleProof extends bsv.Struct {
    constructor (
        flagsNum = 0,
        txIndexVi = bsv.VarInt.fromNumber(0),
        txLengthVi = bsv.VarInt.fromNumber(0),
        txOrIdBuf = Buffer.alloc(0),
        targetBuf = Buffer.alloc(0),
        nodeCountVi = bsv.VarInt.fromNumber(0),
        nodes = []
    ) {
        super({
            flagsNum,
            txIndexVi,
            txLengthVi,
            txOrIdBuf,
            targetBuf,
            nodeCountVi,
            nodes
        })
    }

    computeMerkleRoot () {
        
        let index = this.txIndexVi.toNumber();
        let resultBuf = this.txOrIdBuf;

        if (this.flags & 0x01) {
            // txOrId buf contains a full tx
            resultBuf = bsv.Hash.sha256Sha256(this.txOrIdBuf);
        }

        this.nodes.forEach(function (node) {
            let pair = index % 2 === 0 ? [resultBuf, node.hashBuf] : [node.hashBuf, resultBuf];
            console.log('index', index, index % 2, pair[0].toString('hex'), pair[1].toString('hex'));
            resultBuf = bsv.Hash.sha256Sha256(Buffer.concat(pair));
            index = Math.floor(index/2);
        }); 

        return resultBuf;
    }

    fromJSON (json) {
        const nodes = [];
        json.nodes.forEach(function (node) {
            nodes.push(new MerkleProofNode().fromJSON(node));
        });
        this.fromObject({
            flagsNum: json.flagsNum,
            txIndexVi: new VarInt().fromJSON(txIndexVi),
            txLengthVi: new VarInt().fromJSON(txLengthVi),
            txOrIdBuf: Buffer.from(json.txOrIdBuf, 'hex'),
            targetBuf: Buffer.from(json.targetBuf, 'hex'),
            nodeCountVi: new VarInt().fromJSON(nodeCountVi),
            nodes
        });
        return this
    }

    toJSON () {
        const nodes = [];
        this.nodes.forEach(function (node) {
            nodes.push(node.toJSON());
        });
        return {
            flagsNum: this.flagsNum,
            txIndexVi: this.txIndexVi.toJSON(),
            txLengthVi: this.txLengthVi.toJSON(),
            txOrIdBuf: this.txOrIdBuf.toString('hex'),
            targetBuf: this.targetBuf.toString('hex'),
            nodeCountVi: this.nodeCountVi.toJSON(),
            nodes
        }
    }

    fromBr (br) {
        this.flags = br.readUInt8();
        this.txIndexVi = br.readVarIntNum();

        if (this.flags & 0x01) {
            this.txLengthVi = br.readVarIntNum();
            this.txOrIdBuf = br.read(this.txLengthVi.toNumber());
        } else {
            this.txOrIdBuf = br.read(32);
        }

        if (this.flags & (0x04 | 0x02) === 2) {
            this.targetBuf = br.read(80);
        } else {
            this.targetBuf = br.read(32);
        }

        this.nodeCountVi = br.readVarIntNum();

        for (let i = 0; i < this.nodeCountVi.toNumber(); i++) {
            this.nodes.push(new MerkleProofNode().fromBr(br));
        }

        return this;
    }

    toBw (bw) {
        if (!bw) {
            bw = new Bw();
        }

        bw.writeUInt8(this.flags);
        bw.write(this.txIndexVi.buf);

        if (this.flags & 0x01) {
            bw.write(this.txLengthVi.buf);
        }

        bw.write(this.txOrIdBuf);
        bw.write(this.targetBuf);
        bw.write(this.nodeCountVi.buf);

        for (let i = 0; i < this.nodes.length; i++) {
            this.nodes[i].toBw(bw);
        }

        return bw;
    }
}


module.exports = {
    updateSchema,
    api: MerkleProofDb,
    MerkleProof,
    MerkleProofNode
}
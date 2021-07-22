let bsv = require('bsv');


let mp = '000cef65a4611570303539143dabd6aa64dbd0f41ed89074406dc0e7cd251cf1efff69f17b44cfe9c2a23285168fe05084e1'
       + '254daa5305311ed8cd95b19ea6b0ed7505008e66d81026ddb2dae0bd88082632790fc6921b299ca798088bef5325a607efb9'
       + '004d104f378654a25e35dbd6a539505a1e3ddbba7f92420414387bb5b12fc1c10f00472581a20a043cee55edee1c65dd6677'
       + 'e09903f22992062d8fd4b8d55de7b060006fcc978b3f999a3dbb85a6ae55edc06dd9a30855a030b450206c3646dadbd8c000'
       + '423ab0273c2572880cdc0030034c72ec300ec9dd7bbc7d3f948a9d41b3621e39';

let mpBuf = Buffer.from(mp,'hex');
let br = new bsv.Br(mpBuf);

let flags = br.readUInt8();
let txIndex = br.readVarIntNum();

let txOrId = (flags & 0x01);
let target = (flags & (0x04 | 0x02));
let proofType = (flags & 0x08);
let composite = (flags & 0x10);
let txLength;
let txHash;
let blockHash;
let merkleRoot;
let blockHeader;
let nodeCount;
let nodes = [];

if (txOrId) {
    txLength = br.readVarIntNum();
} else {
    txHash = br.read(32);
}

if (target === 0) {
    blockHash = br.read(32);
} else if (target === 2) {
    blockHeader = br.read(80);
    merkleRoot = blockHeader.slice(36,32);
    blockHash = bsv.Hash.sha256Sha256(blockHeader);
} else if (target === 4) {
    merkleRoot = br.read(32);
}

nodeCount = br.readVarIntNum();

for (let i = 0; i < nodeCount; i++) {
    let nodeType = br.readUInt8();
    let nodeHash;
    let nodeIndex;
    if (nodeType === 0) {
        nodeHash = br.read(32);
    } else if (nodeType === 2) {
        nodeIndex = br.readVarIntNum();
    }
    nodes.push({ type: nodeType, hash: nodeHash, index: nodeIndex });
}

console.log(flags, txOrId, target, proofType, composite);
console.log(txIndex, txLength, txHash && txHash.toString('hex'))
console.log(blockHash && blockHash.toString('hex'));
console.log(merkleRoot && merkleRoot.toString('hex'));
//console.log(nodeCount);
//console.log(nodes);

let pIndex = txIndex;
let pHash = Buffer.from(txHash);

nodes.forEach(function (node) {
    if (pIndex % 2 === 0) {
        pHash = bsv.Hash.sha256(Buffer.concat([pHash, node.hash]));
    } else {
        pHash = bsv.Hash.sha256(Buffer.concat([node.hash, pHash]));
    }
    pIndex = Math.floor(pIndex/2);
});

console.log(pHash.toString('hex'))

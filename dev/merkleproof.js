let bsv = require('bsv');

let { MerkleProof, MerkleProofNode } = require('../merkleproof.js');

let blockHash = Buffer.from('000000000000000003312b6d9d9a9e0206bda053c7567632fd83c5a18d82cbc5', 'hex').reverse();
let merkleRoot = Buffer.from('7a308c702c0863059d0331724b74aade37cf2559bc5a38bf8574a6e05024fc91','hex').reverse();
let txHash = Buffer.from('dfbe73f14c34ea21470b8a5603757bdb21f509f93221f4bc2f41395b7116546d','hex').reverse();
let txIndex = 5;

let mp = new MerkleProof(0, bsv.VarInt.fromNumber(txIndex), undefined, txHash, blockHash, bsv.VarInt.fromNumber(8), [
    new MerkleProofNode(0, Buffer.from('f480ba3ce78d62290e6862cdcb1f81062392ccf5a9608e18c0fdfa935efcdef3','hex').reverse()),
    new MerkleProofNode(0, Buffer.from('02792633db1388bb26e10cbc274a3879c5840e5b6afdd6dbfc09e2fc4f5ddf3f','hex').reverse()),
    new MerkleProofNode(0, Buffer.from('edfb92cb01b360732a3af98967f83939f14b57d8df26c734923476ce5defe107','hex').reverse()),
    new MerkleProofNode(0, Buffer.from('331c2cd6ed77b2af8381c740c42eb05d73ad8069d2b75a9fae00ead981f07fee','hex').reverse()),
    new MerkleProofNode(0, Buffer.from('02645b6c70c92b7b8deaba348931fd7c8861d6b050386f971845e89fd21cfb4e','hex').reverse()),
    new MerkleProofNode(0, Buffer.from('ba16fb724db5ecdea08931e125af4819e4a1c35d7eb042ab9c6d4e9fe00e98b5','hex').reverse()),
    new MerkleProofNode(0, Buffer.from('2616f95ba12e8dc3b7adf6c16eb649b31c3bedd36a5fd7412c98604f6183c45e','hex').reverse()),
    new MerkleProofNode(0, Buffer.from('ee083bcd148e442a29d6a248d73f48fd47fe5c065c34016e6278eb7713181247','hex').reverse())
]);

let result = mp.computeMerkleRoot();

console.log(result.toString('hex'));
console.log(merkleRoot.toString('hex'));


// let mp = '000cef65a4611570303539143dabd6aa64dbd0f41ed89074406dc0e7cd251cf1efff69f17b44cfe9c2a23285168fe05084e1'
//        + '254daa5305311ed8cd95b19ea6b0ed7505008e66d81026ddb2dae0bd88082632790fc6921b299ca798088bef5325a607efb9'
//        + '004d104f378654a25e35dbd6a539505a1e3ddbba7f92420414387bb5b12fc1c10f00472581a20a043cee55edee1c65dd6677'
//        + 'e09903f22992062d8fd4b8d55de7b060006fcc978b3f999a3dbb85a6ae55edc06dd9a30855a030b450206c3646dadbd8c000'
//        + '423ab0273c2572880cdc0030034c72ec300ec9dd7bbc7d3f948a9d41b3621e39';

// let mpBuf = Buffer.from(mp,'hex');
// let br = new bsv.Br(mpBuf);

// let flags = br.readUInt8();
// let txIndex = br.readVarIntNum();

// let txOrId = (flags & 0x01);
// let target = (flags & (0x04 | 0x02));
// let proofType = (flags & 0x08);
// let composite = (flags & 0x10);
// let txLength;
// let txHash;
// let blockHash;
// let merkleRoot;
// let blockHeader;
// let nodeCount;
// let nodes = [];

// if (txOrId) {
//     txLength = br.readVarIntNum();
// } else {
//     txHash = br.read(32);
// }

// if (target === 0) {
//     blockHash = br.read(32);
// } else if (target === 2) {
//     blockHeader = br.read(80);
//     merkleRoot = blockHeader.slice(36,32);
//     blockHash = bsv.Hash.sha256Sha256(blockHeader);
// } else if (target === 4) {
//     merkleRoot = br.read(32);
// }

// nodeCount = br.readVarIntNum();

// for (let i = 0; i < nodeCount; i++) {
//     let nodeType = br.readUInt8();
//     let nodeHash;
//     let nodeIndex;
//     if (nodeType === 0) {
//         nodeHash = br.read(32);
//     } else if (nodeType === 2) {
//         nodeIndex = br.readVarIntNum();
//     }
//     nodes.push({ type: nodeType, hash: nodeHash, index: nodeIndex });
// }

// console.log(flags, txOrId, target, proofType, composite);
// console.log(txIndex, txLength, txHash && txHash.toString('hex'))
// console.log(blockHash && blockHash.toString('hex'));
// console.log(merkleRoot && merkleRoot.toString('hex'));
// //console.log(nodeCount);
// //console.log(nodes);

// let pIndex = txIndex;
// let pHash = Buffer.from(txHash);

// nodes.forEach(function (node) {
//     if (pIndex % 2 === 0) {
//         pHash = bsv.Hash.sha256(Buffer.concat([pHash, node.hash]));
//     } else {
//         pHash = bsv.Hash.sha256(Buffer.concat([node.hash, pHash]));
//     }
//     pIndex = Math.floor(pIndex/2);
// });

// console.log(pHash.toString('hex'))




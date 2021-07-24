const bsv = require('bsv');
const crypto = require('crypto');
const OpCode = bsv.OpCode;

// let key = bsv.PrivKey.fromRandom();
// create key pair
let privKey = bsv.PrivKey.fromString('KzikHFRx6rKA5sfafBgRuRgYPdNh8wF1i7dEzskmXiU6U1Gi97Ui');
let pubKey = bsv.PubKey.fromPrivKey(privKey);
let address = bsv.Address.fromPubKey(pubKey);

console.log(privKey.toString(), pubKey.toString(), address.toString())

// generate privkey2 from privkey1 + nonce
let nonceBn = new bsv.Bn('bb6312237f541302bfb658e15c4112cb',16);
let privKeyBn = privKey.toBn();

let privKey2Bn = privKeyBn.add(nonceBn); 
let privKey2 = bsv.PrivKey.fromBn(privKey2Bn);
let pubKey2 = bsv.PubKey.fromPrivKey(privKey2);
let address2 = bsv.Address.fromPubKey(pubKey2);

console.log(privKey2.toString(), privKeyBn.toString('hex'), nonceBn.toString('hex'))
console.log(pubKey2.toString(), address2.toString(), );

// generate pubkey2 from from pubkey1 + nonce
let pubKey3 = new bsv.PubKey(bsv.Point.getG().mul(nonceBn).add(pubKey.point), pubKey.compressed);
let address3 = bsv.Address.fromPubKey(pubKey3);

console.log(pubKey3.toString(), address3.toString());

let dataHash = bsv.Hash.sha256(Buffer.from('0011223344556677','hex'));
let dataDHash = bsv.Hash.sha256(dataHash);

// peer1 generate scriptPubKey
let scriptPubKey = new bsv.Script();
scriptPubKey.writeOpCode(OpCode.OP_DUP)
scriptPubKey.writeOpCode(OpCode.OP_SHA256)
scriptPubKey.writeBuffer(dataDHash)
scriptPubKey.writeOpCode(OpCode.OP_EQUALVERIFY)
scriptPubKey.writeOpCode(OpCode.OP_DUP)
scriptPubKey.writeOpCode(OpCode.OP_HASH160)
scriptPubKey.writeBuffer(address3.hashBuf)
scriptPubKey.writeOpCode(OpCode.OP_EQUALVERIFY)
scriptPubKey.writeOpCode(OpCode.OP_CHECKSIG)

// peer 2 generate scriptSig
let scriptSig = new bsv.Script();
//scriptSig.writeBuffer(signatureWithPrivKey2);
scriptSig.writeBuffer(pubKey3.toBuffer());
scriptSig.writeBuffer(dataHash);

const fs = require('fs');
const bsv = require('bsv');

const { Order, getScriptPubKey } = require('../orders.js');

let orderjson = JSON.parse(fs.readFileSync('./data/order1.json').toString());
let order = Order.fromJSON(orderjson);

console.log(orderjson);
console.log(Order.fromBuffer(order.toBuffer()).toJSON());

let privKey = bsv.PrivKey.fromString('KzikHFRx6rKA5sfafBgRuRgYPdNh8wF1i7dEzskmXiU6U1Gi97Ui');
let pubKey = bsv.PubKey.fromPrivKey(privKey);

let scriptPubKey = getScriptPubKey(pubKey);

console.log(scriptPubKey.toAsmString());
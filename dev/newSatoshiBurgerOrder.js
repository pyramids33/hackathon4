

let P2OHPKH = require('../p2ohpkh.js');
let crypto = require('crypto');

let order = new P2OHPKH.Order();
order.dateNum = Date.now();
order.vendorPubKey = '03ab68c8e3abd7ef5acd9a357a4abeb5bb5475137489f369e9e9a917942e2911b0';
order.vendor = 'Satoshi Burger';
order.nonceBuf = crypto.randomBytes(16);

let orderJSON = order.toJSON();
process.stdout.write(JSON.stringify(orderJSON, null, 4));

const axios = require('axios');
const fs = require('fs')
const bsv = require('bsv');

const P2OHPKH = require('../p2ohpkh.js');
//ZrbrxvCyFr5a5e5-ezQRmpUPV6PNecfeavSd7xwI9bP7XNtDZo1x6SfXRemrMEMtcjzEi_1BvBTOSKgRjbvInw
let orderFile = process.argv.length > 2 && process.argv[2];
let orderTxFile = process.argv.length > 3 && process.argv[3];

let orderJSON = JSON.parse(fs.readFileSync(orderFile).toString());
let order = P2OHPKH.Order.fromJSON(orderJSON);
let orderTx = bsv.Tx.fromBuffer(fs.readFileSync(orderTxFile));

let endpoint = 'https://hack.spvchannels.io';
let vendorChannelId = '3VOw2phrrXET1KrBNn2drPR9jB9yz3YQ1UpRN6QT11d8M8uJAvstZ42ojcWlwNhSoaBnY0i3W4yOFTvGqLgDgQ';
let authHeader = 'Bearer TQiZINz6ykF1ECZe8jfHNi4FrGQVOlKQfBJlvkffe_zA9svJ7jqXLrbm6UWIj26VeUZByFOSukTeFgs8KFJbbg';

(async function () {
try {
    
    let response = await axios.post(`${endpoint}/api/v1/channel/${vendorChannelId}`,
        { order: order.toBuffer().toString('hex'), 
          tx: orderTx.toBuffer().toString('hex') },
        { headers: { 'Authorization': authHeader }})

    console.log(response.data);

} catch (error) {
    console.log(error.response.status);
}
})();

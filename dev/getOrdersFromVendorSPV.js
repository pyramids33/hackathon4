const axios = require('axios');
const fs = require('fs')
const path = require('path');

let outDir = process.argv.length > 2 && process.argv[2];

let endpoint = 'https://hack.spvchannels.io';
let vendorChannelId = '3VOw2phrrXET1KrBNn2drPR9jB9yz3YQ1UpRN6QT11d8M8uJAvstZ42ojcWlwNhSoaBnY0i3W4yOFTvGqLgDgQ';
let authHeader = 'Bearer ZrbrxvCyFr5a5e5-ezQRmpUPV6PNecfeavSd7xwI9bP7XNtDZo1x6SfXRemrMEMtcjzEi_1BvBTOSKgRjbvInw';

let lastMessage = 0;
(async function () {
try {
    
    let response = await axios.get(`${endpoint}/api/v1/channel/${vendorChannelId}?unread=true`,
        { headers: { 'Authorization': authHeader }})

   if (response.data.length === 0) {
        console.log('none');
        process.exit(1);
   }

    response.data.forEach(function (item) {
        let obj = JSON.parse(Buffer.from(item.payload,'base64').toString('utf8'));
        let orderBuf = Buffer.from(obj.order, 'hex');
        let txBuf = Buffer.from(obj.tx, 'hex');
        let orderFileName = path.resolve(outDir, `order_${item.sequence}.bin`);
        let txFileName = path.resolve(outDir, `ordertx_${item.sequence}.bin`);
        
        fs.writeFileSync(orderFileName, orderBuf);
        fs.writeFileSync(txFileName, txBuf);
        
        console.log('saved message ' + item.sequence);
        lastMessage = item.sequence;
    });

    response = await axios.post(`${endpoint}/api/v1/channel/${vendorChannelId}/${lastMessage}?older=true`,
        { read: true },
        { headers: { 'Authorization': authHeader }});

    console.log('read up to ' + lastMessage);

} catch (error) {
    if (error.response) {
        console.log(error.response.status);
    } else {
        console.log(error);
    }
}
})();

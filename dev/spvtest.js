
let axios = require('axios');
let fs = require('fs')

let credsFile = process.argv.length > 2 ? process.argv[2] : undefined;
let creds = JSON.parse(fs.readFileSync(credsFile).toString());
let endpoint = 'https://hack.spvchannels.io';
let authHeader = 'Basic ' + Buffer.from(creds.UserId+':'+creds.Password).toString('base64');

console.log(creds)
console.log(authHeader)
console.log(Buffer.from(creds.UserId+':'+creds.Password).toString('base64'));

process.exit(1)

(async function () {
try {
    
    let response = await axios.get(`${endpoint}/api/v1/account/${creds.AccountId}/channel/list`, 
        { headers: { 'Authorization': authHeader }})

    console.log(response.data);

} catch (error) {
    console.log(error.response.status);
}
})();


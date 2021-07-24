
let axios = require('axios');
let fs = require('fs')

let credsFile = process.argv.length > 2 ? process.argv[2] : undefined;
let creds = JSON.parse(fs.readFileSync(credsFile).toString());
let endpoint = 'https://hack.spvchannels.io';
let authHeader = 'Basic ' + Buffer.from(creds.UserId+':'+creds.Password).toString('base64');

console.log(creds)
console.log(authHeader)
console.log(Buffer.from(creds.UserId+':'+creds.Password).toString('base64'));

(async function () {
try {
    
    let response = await axios.get(`${endpoint}/api/v1/account/${creds.AccountId}/channel/list`, 
        { headers: { 'Authorization': authHeader }})

    console.log(response.data);

} catch (error) {
    console.log(error.response.status);
}
})();

/*
{
    "id": "qVVJCE5kA5ftIdOI_7njM8KMlPFUVQpZx-jlwHFcIVtUfPU1_zXAcnTrCjJz-45QZAG8hJy2OhGQzjFtncAHlQ",
    "href": "https://hack.spvchannels.io/api/v1/channel/qVVJCE5kA5ftIdOI_7njM8KMlPFUVQpZx-jlwHFcIVtUfPU1_zXAcnTrCjJz-45QZAG8hJy2OhGQzjFtncAHlQ",
    "public_read": false,
    "public_write": false,
    "sequenced": false,
    "locked": false,
    "head": 0,
    "retention": {
      "min_age_days": 0,
      "max_age_days": 0,
      "auto_prune": true
    },
    "access_tokens": [
      {
        "id": "1201",
        "token": "NSylXPqIZduVtZ5KarhXP8nA31IuS-ncQ4dQevK8Sw8B9BsGM1akXZMDcC6fF0d6i-yTKOCqqQdBYLBJBVxWfA",
        "description": "Owner",
        "can_read": true,
        "can_write": true
      }
    ]
  }

{
  "id": "1204",
  "token": "K4LF0bMCZCCBAbHOdDLTzRoUuJCQLD5N9Z1UjkaVZoqIgbjL25xcSIXKyb8H8_kw0MPiMYPTQ5tU8hLnv9aquw",
  "description": "string",
  "can_read": false,
  "can_write": true
}

*/

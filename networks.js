const bsv = require('bsv');

module.exports = {
    testnet: {
        name: 'testnet',
        genesisBlock: {
            hash: '43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea330900000000',
            merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
            time: 1296688602,
            nonce: 414098458,
            bits: 0x1d00ffff,
        },
        peers: [
            '70.114.25.192'
        ],
        constants: bsv.Constants.Testnet,
        Bip32: bsv.Bip32.Testnet,
        Address: bsv.Address.Testnet,
        PrivKey: bsv.PrivKey.Testnet,
        KeyPair: bsv.KeyPair.Testnet
    },
    mainnet: {
        name: 'mainnet',
        genesisBlock: {
            hash: '6fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000',
            merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
            time: 1231006505,
            nonce: 2083236893,
            bits: 0x1d00ffff
        },
        peers: [
            '159.65.152.200'
        ],
        constants: bsv.Constants.Mainnet,
        Bip32: bsv.Bip32.Mainnet,
        Address: bsv.Address.Mainnet,
        PrivKey: bsv.PrivKey.Mainnet,
        KeyPair: bsv.KeyPair.Mainnet
    }
}
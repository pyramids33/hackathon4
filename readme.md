

# Alien Wallet
## BSV Hackathon 2021  

*by Tim Middleton*

Demo Video: https://vimeo.com/579287608

For this hackathon I continued the CLI wallet from hackathon3:  
  
- Rewrite/Refactored most of the code
- Updated to use BSV 2.0 library
- Download and store block headers from P2P network
- Merkle Proofs support (classes written but they are not wired up)
- Mapi Functions
    - Fee quotes (downloads fee quotes but doesn't use them yet)
    - Transaction Submission
    - Merkle proof callbacks over SPV channels
- Extensibility
    - BaseWallet class can be extended, TxHandler and SpendHandlers
- P2OHPKH (Pay to Order Hash + Public Key Hash)
    - Uses the 'Extended Addressing' concept from Bitcoin Class (https://www.youtube.com/watch?v=rezvcJ4j-7U)
    - Customer and Vendor communicate over SPV Channels

## P2OHPKH - Shopping with BSV  

This transaction type relates to placing an order with a vendor along with payment.  

The customer creates a new order object, pays the order total to a P2OHPKH 
script. They can either broadcast the transaction themself or let the vendor broadcast it.

The script is generated from:  
- sha256(sha256(Order))
- OrderPubKey (VendorsPubKey + OrderNonce)
- RefundPubKey (randomly generated by the customer)

This script may be spend by providing:
- sha256(Order)
- OrderPubKey and sign with OrderPrivKey (VendorsPrivKey + OrderNonce)
- or
- RefundPubKey and sign with RefundPrivKey

The customer sends the order details and payment transaction to the vendor over an 
SPV channel (or any other method).

The vendor checks the order and may accept or reject it.
If accepted, the vendor spends the P2POHPKH output, and sends the tx back to the customer.
The customer has reserved that UTXO in their wallet, so by processing the tx, it is 
marked as spent. The vendor should then deliver the order as normal.

If the vendor rejects the order, or the customer wishes to cancel the order,
the customer may spend the output using their refund key. The vendor may also issue
a refund after spending the order, using the customers refund address.

If the vendor spends the output, it is evidence that they saw the order and accepted it.
If they do not deliver on the order, thats like paying for a meal at mcdonalds 
and never getting your food.


Example Script:  
```
<signature>
<pubkey>
<orderSha256>
---
OP_SHA256
<orderDoubleSha256>
OP_EQUALVERIFY
OP_DUP
OP_DUP
OP_HASH160
<orderPKH>
OP_EQUAL
OP_SWAP
OP_HASH160
<refundPKH>
OP_EQUAL
OP_BOOLOR
OP_TRUE
OP_EQUALVERIFY
OP_CHECKSIG
```

Example Order in JSON format
```
{
    "dateNum": 1627207918970,
    "vendor": "Satoshi Burger",
    "vendorPubKey": "03ab68c8e3abd7ef5acd9a357a4abeb5bb5475137489f369e9e9a917942e2911b0",
    "destination": "21 Bitcoin Street",
    "nonceBuf": "71a52b2ba9b0318b7ec91ba42cea0d35",
    "items": [{
        "itemCode": "ac65", 
        "description": "large 'frozen' coke",
        "price": 3000
    },
    {
        "itemCode": "ac66", 
        "description": "large frog leg fries",
        "price": 3000
    },{
        "itemCode": "ac67", 
        "description": "hmac and cheeseburger",
        "price": 6000
    }]
}

```

Example Txids
```
// Customer confirms order
40d763df15d417e27a80aa4a7b14eebc8d20d1ac5c487977f7ff260303ad2eda

// Vendor accepts order
ddf1e54b13d67c6ab27a305192de2556a018c291e2e89da4320d3a333092d0eb

```

## CLI

Here are the commands available in the CLI:

```
Usage: alien [options] [command]

Options:
  -V, --version                                     output the version number
  -w --dbfile <dbfile>                              wallet database file (default: "./wallet.db")
  -h, --help                                        display help for command

Commands:
  init [options]                                    create a new wallet file
  balance [options]                                 show balance
  show-chaintips                                    show the chaintip(s)
  sync-headers [options]                            download block headers
  show-keys                                         show hdkeys
  add-key <name> <xprv>                             add a hdkey
  tx [options]                                      process a transaction
  download-tx <txid>                                download tx from whats on chain
  receive [options]                                 generate a p2pkh address to receive funds
  send [options] <amount> <pubKeyHash>              create a tx sending amount to address (p2pkh)
  spend-all [options] <pubKeyHash>                  create a tx sending all spendable to address (p2pkh)
  add-mapi <name> <pubkey> <endpoint>               add a mapi endpoint
  show-mapi [options]                               show mapi endpoints
  get-fee-quote [options] <miner>                   get fee quote from mapi
  set-mapi-spvchannel <url> <token>                 set callback url for merkle proofs
  show-mapi-spvchannel                              show callback url for merkle proofs
  set-mapi-spvtoken <name> <token>                  set miners token to use when sending merkle proof callbacks
  check-mapi-spvchannel                             check spv channel for merkle proof
  submit-tx <miner> <txfilename>                    submit tx via mapi
  set-vendor-key <privkey>                          set the vendor private key for receiving orders
  show-vendor-key                                   set the vendor private key for receiving orders
  order-start [options] <orderfile>                 create a tx paying the order in orderfile
  order-accept [options] <orderfile> <ordertxfile>  creates a tx spending the order script with vendor key
  order-cancel [options] <orderfile> <ordertxfile>  creates a tx spending the order script with refund key
```

Example Usage  
```
// create a tx sending money
alien send 1000 1234pubkKeyHash > tx1_send.bin

// analyse the tx to check its what you expected (optional)
alien tx -a -f tx1_send.bin

// submit the transaction
alien submit-tx taal tx1_send.bin

// if successfully broadcast, process the transaction
alien tx -p -f tx1_send.bin

```

## Improvements  

There are many improvements that can be made to the wallet.  
Mostly what I have done is the bare minimum to have it work.  

Headers
- The headers take a while to sync. This could be solved by copying from another database, 
        and/or providing preloaded databases, or using a shared headers database.
- Haven't really tested on reorgs/forks.

Transactions
- Pruning: if all the utxos are spent, you could prune the transaction

MerkleProofs
- Actively check and download merkle proofs for all transactions.

Fee Quotes
- The user can see the fee quotes, so should be able to set the fee rate when they create a tx.
      They can already choose the mapi endpoint for submission. There could be an auto option to pick
      the best rate.

Network
- The peers are just hard-coded, I should use the DNS seeds to get peers
- Add more p2p function such as responding to requests

Database Schema Version
- There is no version control on database schemas. What I could do is pass a version
        number into the 'updateSchema' functions, run that when you open the wallet so 
        that any extensions can update their schemas.

SPV Channels
- I was going to add more functions around SPV channels, but they would not be in the wallet code.
      E.g, the ordering system can track orders and notify users on SPV channels, just use the wallet 
      to create/submit transactions. 
      In this project I mock it up using some hardcoded scripts, which are in the dev folder of the repo.

```
// customer send order and tx to vendor spv channel
> node dev/sendOrderToVendorSPV.js ./data/wallet1/order2.json ./data/wallet1/tx_order2.bin

// vendor download orders into folder for processing into order system 
> node dev/getOrdersFromVendorSPV.js ./data/vendorspv/
```

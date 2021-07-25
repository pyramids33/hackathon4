

Alien Wallet
bsv Hackathon 2021

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
    - Uses the 'Extended Addressing' concept from Bitcoin Class
    - Customer and Vendor communicate over SPV Channels

P2OHPKH - Shopping with BSV
This transaction type relates to placing an order with a vendor along with payment.

The customer creates a new order object, pays the order total to a P2OHPKH 
script, and broadcasts the transaction.

The script is generated from:
    - sha256(sha256(Order))
    - OrderPubKey (VendorsPubKey + OrderNonce)
    - RefundPubKey (randomly generated by the customer)

This script may be spend by providing:
    - sha256(Order)
    - OrderPubKey and sign with OrderPrivKey (VendorsPrivKey + OrderNonce)
    or
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

Improvements

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

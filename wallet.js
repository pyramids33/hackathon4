const sqlite3 = require('better-sqlite3');
const bsv = require('bsv');

const Headers = require('./headers.js');
const HDKeys = require('./hdkeys.js');
const TxOutputs = require('./txoutputs.js');
const Transactions = require('./transactions.js');
const WalletMeta = require('./walletmeta.js');
const Mapi = require('./mapi.js');
const P2PKH = require('./p2pkh.js');
const Scripts = require('./scripts.js');

const { Transactor } = require('./dbutil.js');
const Networks = require('./networks.js');

function TxHandler (scriptsDb, txOutputsDb) {
    return function handleTx (txHash, tx) {

        let report = {
            in: [],
            out: []
        };

        tx.txIns.forEach(function (input, index) {
            let txOutputInfo = txOutputsDb.getTxOutput(input.txHashBuf, input.txOutNum);
            
            if (txOutputInfo) {
                txOutputsDb.spendTxOutput(input.txHashBuf, input.txOutNum, tx.hash(), index);
                
                report.in.push({
                    txHash: input.txHashBuf,
                    txOutNum: input.txOutNum, 
                    type: txOutputInfo.type, 
                    amount: txOutputInfo.amount,
                    status: txOutputInfo.status
                });
            }
        });

        tx.txOuts.forEach(function (output, index) {
            let scriptHash = bsv.Hash.sha256(output.script.toBuffer());
            let scriptInfo = scriptsDb.getScriptByHash(scriptHash);

            if (scriptInfo) {
                txOutputsDb.addTxOutput(txHash, index, output.valueBn.toNumber(), scriptInfo.type, scriptInfo.initialstatus);

                report.out.push({
                    txHash,
                    txOutNum: index, 
                    type: scriptInfo.type,
                    amount: output.valueBn.toNumber(),
                    status: scriptInfo.initialstatus
                });
            }
        });

        return report;
    }
}

class BaseWallet {

    static updateSchema (db) {
        Headers.updateSchema(db);
        TxOutputs.updateSchema(db);
        HDKeys.updateSchema(db);
        Transactions.updateSchema(db);
        WalletMeta.updateSchema(db);
        Scripts.updateSchema(db);
        Mapi.updateSchema(db);
    }

    static initDb (networkName, currentTime) {        
        
        let networkInfo = Networks[networkName];

        if (networkInfo === undefined) {
            throw new Error('Unknown network');
        }

        const db = new sqlite3(':memory:');

        this.updateSchema(db);
        
        let wm = WalletMeta.api(db);
        wm.setValue('created', currentTime);
        wm.setValue('network', networkName);

        HDKeys.initData(db, networkInfo);

        // add the genesis header
        Headers.api(db).addHeader(
            Buffer.from(networkInfo.genesisBlock.hash,'hex'), 0, 1, null, 
            Buffer.from(networkInfo.genesisBlock.merkleRoot,'hex'), 
            networkInfo.genesisBlock.time, 
            networkInfo.genesisBlock.bits, 
            networkInfo.genesisBlock.nonce);
        
        return db;
    }

    #txHandlers = [];
    #spendHandlers = {};

    constructor (db) {
        this.db = db;
        this.dbTransaction = Transactor(db);
        this.walletMeta = WalletMeta.api(db);

        let network = this.getNetwork();

        this.headers = Headers.api(db);
        this.hdkeys = HDKeys.api(db);
        this.txoutputs = TxOutputs.api(db);
        this.transactions = Transactions.api(db);
        this.scripts = Scripts.api(db);
        this.mapi = Mapi.api(db);
        
        this.#txHandlers.push(TxHandler(this.scripts, this.txoutputs, network));
        this.#spendHandlers[P2PKH.TXO_TYPE] = P2PKH.SpendHandler(this.hdkeys, network);
    }

    getNetwork () {
        let networkName = this.walletMeta.getString('network');
        return Networks[networkName];
    }

    addTransaction (tx, commit) {
        let txhash = tx.hash();
        let reportsCombined = {
            in: [],
            out: []
        };
        
        try {
            this.dbTransaction(() => {
                this.#txHandlers.forEach(function (fn) {
                    let report = fn(txhash, tx);
                    reportsCombined.in = [...reportsCombined.in, ...report.in];
                    reportsCombined.out = [...reportsCombined.out, ...report.out];
                });
                
                this.transactions.addTransaction(txhash, 'processed', tx.toBuffer());
                
                if (!commit) {
                    throw new Error('rollback intentionally');
                }
            });
        } catch (err) {
            if (err.message !== 'rollback intentionally') {
                throw err;
            }
        }

        return reportsCombined;
    }

    getSpendHandler (type) {
        return this.#spendHandlers[type];
    }

    //
    // add inputs and change to a transaction
    // changeKeyName is the name of hdkey to generate addresses
    // feePerKbNum defaults to bsv network constants. query the mapi table to pass in a custom rate
    // if addScriptSigs is true, the signed unlocking scripts are added (SIGHASH_ALL)
    // if spendAllTxOutNum is defined, send all change to that output (dont add more change outputs)
    // todo: factor this to something like bsv.TxBuilder 
    //
    fundTransaction (tx, changeKeyName='default', feePerKbNum, addScriptSigs=true, spendAllTxOutNum) {

        let lastUtxoRowId = 0;
        let valueIn = new bsv.Bn(0);
        let valueOut = tx.txOuts.reduce((p,c) => p.add(c.valueBn), new bsv.Bn(0));
        let unlockScriptWriters = {};
        let scriptSigsTotal = 0;

        let network = this.getNetwork();
        feePerKbNum = feePerKbNum || network.constants.TxBuilder.feePerKbNum;
        let dust = network.constants.TxBuilder.dust;

        while (true) {

            let utxoInfo = this.txoutputs.nextUtxo(lastUtxoRowId);
            
            if (utxoInfo === undefined) {
                if (spendAllTxOutNum !== undefined) {
                    // we spent all utxos as intended so we can exit loop here
                    break;
                }
                throw new Error('Not enough UTXOs');
            }

            lastUtxoRowId = utxoInfo.rowid;

            let utxoId = utxoInfo.txhash.toString('hex') + ':' + utxoInfo.txoutnum.toString();

            let spendTxInfo = this.transactions.txByHash(utxoInfo.txhash);
            let spendTx = bsv.Tx.fromBuffer(spendTxInfo.rawtx);
            let spendTxOut = spendTx.txOuts[utxoInfo.txoutnum];

            let scriptHash = bsv.Hash.sha256(spendTxOut.script.toBuffer());
            let scriptInfo = this.scripts.getScriptByHash(scriptHash);
            let scriptData = JSON.parse(scriptInfo.data.toString());

            let spendHandler = this.getSpendHandler(utxoInfo.type);

            unlockScriptWriters[utxoId] = function (tx, nIn, hashCache) { 
                return spendHandler.getUnlockScript(tx, nIn, scriptData, spendTxOut, hashCache);
            }

            let scriptSigSize = spendHandler.calculateSize(scriptData);
            
            scriptSigsTotal += scriptSigSize;

            tx.addTxIn(utxoInfo.txhash, utxoInfo.txoutnum, new bsv.Script());

            valueIn = valueIn.add(spendTxOut.valueBn);

            let estimatedSize = tx.toBuffer().length + scriptSigsTotal;
            let estimatedFee = new bsv.Bn(Math.ceil(estimatedSize / 1000 * feePerKbNum));
            let changeAmount = valueIn.sub(valueOut);
            let minValueIn = valueOut.add(estimatedFee).add(dust);

            // console.log(
            //     'a',
            //     valueIn.toNumber(), 
            //     valueOut.toNumber(), 
            //     changeAmount.toNumber(), 
            //     estimatedFee.toNumber(),
            //     minValueIn.toNumber(), 
            //     '___',
            //     tx.toBuffer().length, 
            //     scriptSigsTotal, 
            //     estimatedSize);

            if (spendAllTxOutNum === undefined) {
                
                // add change outputs back to us

                while (changeAmount.gt(dust)) {
                    let changeScript = P2PKH.receive(this.scripts, this.hdkeys, changeKeyName, network);
                    let changeTxOut = bsv.TxOut.fromProperties(new bsv.Bn(0), changeScript);
                    
                    estimatedSize += changeTxOut.toBuffer().length;
                    estimatedFee = new bsv.Bn(Math.ceil(estimatedSize / 1000 * feePerKbNum));

                    if (changeAmount.sub(estimatedFee).gt(200000)) {
                        changeTxOut.valueBn = changeAmount.sub(estimatedFee).div(2);
                    } else {
                        changeTxOut.valueBn = changeAmount.sub(estimatedFee);
                    }
                    
                    tx.addTxOut(changeTxOut);

                    valueOut = valueOut.add(changeTxOut.valueBn);

                    changeAmount = valueIn.sub(valueOut);
                    minValueIn = valueOut.add(estimatedFee);

                    // console.log(
                    //     'c',
                    //     valueIn.toNumber(), 
                    //     valueOut.toNumber(), 
                    //     changeAmount.toNumber(), 
                    //     estimatedFee.toNumber(),
                    //     minValueIn.toNumber(), 
                    //     changeTxOut.valueBn.toNumber(),
                    //     tx.toBuffer().length, 
                    //     scriptSigsTotal, 
                    //     estimatedSize);
                }
            } else {
                tx.txOuts[spendAllTxOutNum].valueBn = changeAmount.sub(estimatedFee);
            }

            if (valueIn.lt(minValueIn) || spendAllTxOutNum !== undefined) {
                // need more inputs to fund tx, or we want to spend everything
                continue;
            }

            // the tx is funded
            break;
        }

        if (addScriptSigs) {
            let hashCache = {};

            tx.txIns.forEach(function (txIn, nIn) {
                let utxoId = txIn.txHashBuf.toString('hex') + ':' + txIn.txOutNum.toString();
                if (unlockScriptWriters[utxoId]) {
                    let script = unlockScriptWriters[utxoId](tx, nIn, hashCache);
                    txIn.setScript(script);
                }
            });
        }

        return tx;
    }
}

module.exports = BaseWallet;
    
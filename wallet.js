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
            networkInfo.genesisBlock.hash, 0, 1, null, 
            networkInfo.genesisBlock.merkleRoot, 
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
}

module.exports = BaseWallet;
    
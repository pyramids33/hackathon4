const sqlite3 = require('better-sqlite3');
const bsv = require('bsv');

const Headers = require('./headers.js');
const HDKeys = require('./hdkeys.js');
const TxOutputs = require('./txoutputs.js');
const Transactions = require('./transactions.js');
const WalletMeta = require('./walletmeta.js');
const P2PKH = require('./p2pkh.js');
const Scripts = require('./scripts.js');

const SyncHeaders = require('./p2pnetwork.js');
const { OpenSqliteFile, Transactor } = require('./dbutil.js');
const Networks = require('./networks.js');

function TxHandler (scriptsDb, txOutputsDb) {
    return function handleTx (txhash, tx) {
        let report = [];
        
        tx.txIns.forEach(function (input, index) {
            let txOutput = txOutputsDb.getTxOutput(input.txHashBuf, input.txOutNum);
            
            if (txOutput) {
                txOutputsDb.spendTxOutput(input.txHashBuf, input.txOutNum, tx.hash(), index);
                report.push([ 'input', index, txOutput.type, txOutput.amount ]);
            }
        });

        tx.txOuts.forEach(function (output, index) {
            let scriptHash = bsv.Hash.sha256(output.script.toBuffer());
            let scriptInfo = scriptsDb.getScriptByHash(scriptHash);

            if (scriptInfo) {
                txOutputsDb.addTxOutput(txhash, index, output.valueBn.toNumber(), scriptInfo.type, scriptInfo.initialstatus);
                report.push([ 'output', index, scriptInfo.type, output.valueBn, scriptInfo.initialstatus]);
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
        
        this.#txHandlers.push(TxHandler(this.scripts, this.txoutputs, network));
        this.#spendHandlers[P2PKH.TXO_TYPE] = P2PKH.SpendHandler(this.scripts, this.hdkeys, network);
    }

    getNetwork () {
        let networkName = this.walletMeta.getString('network');
        return Networks[networkName];
    }

    addTransaction (tx, commit) {
        let txhash = tx.hash();
        let reports;
        
        try {
            this.dbTransaction(() => {
                reports = this.#txHandlers.map(fn => fn(txhash, tx));
                this.transactions.addTransaction(tx.hash(), 'processed', tx.toBuffer());
                
                if (!commit) {
                    throw new Error('rollback intentionally');
                }
            });
        } catch (err) {
            if (err.message !== 'rollback intentionally') {
                throw err;
            }
        }

        return reports;
    }

    getSpendInfo (txhash, index, output) {
        let txo = this.txoutputs.getTxOutput(txhash, index);
        
        if (txo === undefined) {
            throw new Error('Unknown utxo');
        }

        let handler = this.#spendHandlers[txo.type];

        if (handler === undefined) {
            throw new Error('Unknown utxo type');
        }

        return handler(txhash, index, output);
    }

    syncHeaders (host, onReport) {
        let network = this.getNetwork();
        SyncHeaders(
            host, 
            network.constants.Port,
            network.constants.Msg.versionBytesNum, 
            network.constants.Msg.magicNum,
            this.headers, 
            onReport);
    }
}

function getWallet (db) {
    return new BaseWallet(db);
}

function initWallet (network, currentTime) {
    return BaseWallet.initDb(network, currentTime);
}

function makeProgram (initWallet, getWallet) {

    const program = new commander.Command();
    program.version('1.0.0');
    program.option('-d --dbfile <path>', 'database file', './wallet.db')

    program.command('init')
        .description('create a new wallet file')
        .action (async (options, command) => {
            try {
                process.stdout.write(initWallet());
            } catch (err) {
                if (err.code === 'EEXIST') {
                    console.error(`${dbfilename} already exists.`);
                    process.exit(1);
                }
            }
        });

    program.command('headers')
        .description('download block headers')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);

            let chainTip = this.headers.getChainTips()[0];
            console.log('chaintip', chainTip.height, chainTip.hash);

            wallet.syncHeaders(function (report) {
                let chainTip = this.headers.getChainTips()[0];
                console.log('received', report.headerCount, 'headers, processed in', (report.processingTime/1000).toFixed(2), 'seconds');
                console.log('chaintip', chainTip.height, chainTip.hash);
            });
        });

    program.command('transaction')
        .description('tx')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            wallet.addTransaction()
        });

    return program;
}


module.exports = { makeProgram, BaseWallet, getWallet, initWallet };
    
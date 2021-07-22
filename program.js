const commander = require('commander');
const fs = require('fs');
const bsv = require('bsv');
const axios = require('axios').default;

const SyncHeaders = require('./p2pnetwork.js');
const { OpenSqliteFile } = require('./dbutil.js');
const BaseWallet = require('./wallet.js');
const P2PKH = require('./p2pkh.js');
const { TXO_STATUS } = require('./txoutputs.js');

function getWallet (db) {
    return new BaseWallet(db);
}

function initWallet (network, currentTime) {
    return BaseWallet.initDb(network, currentTime);
}

function makeProgram (initWallet, getWallet) {

    const program = new commander.Command();
    program.version('1.0.0');
    program.option('-w --dbfile <dbfile>', 'wallet database file', './wallet.db')

    program.command('init')
        .description('create a new wallet file')
        .option('-o --outputFile <filename>', 'save as file location. if this is omitted the wallet is written to stdout.')
        .option('-n --network <network>', 'mainnet or testnet', 'mainnet')
        .action (function (options, command) {
            let db;
            let { network, outputFile } = options;
            try {
                db = initWallet(network, Date.now());
                if (outputFile) {
                    fs.writeFileSync(outputFile, db.serialize(), { flag: 'wx' });
                } else {
                    process.stdout.write(db.serialize());
                }
            } catch (err) {
                if (err.code === 'EEXIST') {
                    console.error(`ERROR: file already exists`);
                    process.exit(1);
                }
                throw err;
            }
        });

    program.command('balance')
        .description('show balance')
        .option('-l --list', 'list all the txos')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);

            let utxos = wallet.txoutputs.txOutputsByStatus(TXO_STATUS.SPENDABLE);
            let rtxos = wallet.txoutputs.txOutputsByStatus(TXO_STATUS.RESERVED);
            let ctxos = wallet.txoutputs.txOutputsByStatus(TXO_STATUS.UNSPENDABLE);

            let totals = {
                utxos: utxos.reduce((p,c) => p + c.amount, 0),
                rtxos: rtxos.reduce((p,c) => p + c.amount, 0),
                ctxos: ctxos.reduce((p,c) => p + c.amount, 0)
            };

            function displayTxo (item) {
                return {
                    label: Buffer.from(item.txhash).reverse().toString('hex') + ':' + item.txoutnum.toString(),
                    amount: item.amount
                };
            }

            console.log('spendable:', totals.utxos);
            if (options.list) console.table(utxos.map(displayTxo));

            console.log('reserved:', totals.rtxos);
            if (options.list) console.table(rtxos.map(displayTxo));

            console.log('unspendable:', totals.ctxos);
            if (options.list) console.table(ctxos.map(displayTxo));
        });

    program.command('sync-headers')
        .description('download block headers')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();

            let chainTip = wallet.headers.getChainTips()[0];
            console.log('chaintip', chainTip.height, chainTip.hash);
            
            SyncHeaders(
                network.peers[0], 
                network.constants.Port,
                network.constants.Msg.versionBytesNum, 
                network.constants.Msg.magicNum,
                wallet.headers, 
                function (report) {
                    let chainTip = wallet.headers.getChainTips()[0];
                    console.log('received', report.headerCount, 'headers, processed in', (report.processingTime/1000).toFixed(2), 'seconds');
                    console.log('chaintip', chainTip.height, chainTip.hash);
                }
            );
        });

    program.command('show-keys')
        .description('show hdkeys')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let rows = wallet.hdkeys.allHDKeys().map(row => { return {
                name: row.name,
                counter: row.counter,
                drvpath: row.derivationpath
            }});
            console.table(rows);
        });    

    program.command('add-key <name> <xprv>')
        .description('add a hdkey')
        .action (async (name, xprv, options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();
            let hdKey = network.Bip32.fromString(xprv);
            wallet.hdkeys.addHDKey(name, hdKey.toBuffer());
        });

    program.command('transaction')
        .description('process a transaction')
        .option('-f, --file <filepath>', 'read tx from binary file')
        .option('-x, --hexfile <filepath>', 'read tx from a file containing a hex string. such as from WhatsOnChain api')
        .option('-h, --hex', 'show hex. no other processing is done.')
        .option('-a, --analyse', 'show changes but do not save them')
        .option('-p, --process', 'update the wallet with the tx')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);

            let txBuf;
            
            if (options.file) {
                txBuf = fs.readFileSync(options.file);
            } else if (options.hexfile) {
                let hexString = fs.readFileSync(options.hexfile).toString();
                txBuf = Buffer.from(hexString,'hex');
            }
            
            if (options.hex) {
                console.log(txBuf.toString('hex'));
            } else {
                if (options.analyse || options.process)  {
                    let tx = bsv.Tx.fromBuffer(txBuf);
                    let commit = options.process === true;
                    let reports = wallet.addTransaction(tx, commit);
                    
                    if (options.analyse) {

                        let totals = {
                            spendable: 0,
                            reserved: 0,
                            unspendable: 0
                        };

                        reports.in.forEach(function (item) {
                            if (item.status === TXO_STATUS.SPENDABLE) totals.spendable -= item.amount;
                            if (item.status === TXO_STATUS.RESERVED) totals.reserved -= item.amount;
                            if (item.status === TXO_STATUS.UNSPENDABLE) totals.unspendable -= item.amount;
                        });

                        reports.out.forEach(function (item) {
                            if (item.status === TXO_STATUS.SPENDABLE) totals.spendable += item.amount;
                            if (item.status === TXO_STATUS.RESERVED) totals.reserved += item.amount;
                            if (item.status === TXO_STATUS.UNSPENDABLE) totals.unspendable += item.amount;
                        });

                        function displayReport (item) {
                            let o = {
                                label: Buffer.from(item.txHash).reverse().toString('hex') + ':' + item.txOutNum.toString(),
                                amount: item.amount,
                                type: item.type
                            };
                            if (item.status === TXO_STATUS.SPENDABLE) o.status = 's';
                            if (item.status === TXO_STATUS.RESERVED) o.status = 'r';
                            if (item.status === TXO_STATUS.UNSPENDABLE) o.status = 'u';
                            return o;
                        }
            
                        console.log('spendable:', totals.spendable);
                        console.log('reserved:', totals.reserved);
                        console.log('unspendable:', totals.unspendable);
                        console.log();
                        console.log('added: ',);
                        console.table(reports.out.map(displayReport));
                        console.log();
                        console.log('spent: ');
                        console.table(reports.in.map(displayReport));
                       
                    }
                }
            }
        });

    program.command('receive')
        .description('generate a p2pkh address to receive funds')
        .option('-k --keyname <name>', 'specify which key you want to use', 'default')
        .option('-s --script', 'return the script in hex format pubKeyHash string')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();
            let script = P2PKH.receive(wallet.scripts, wallet.hdkeys, options.keyname, network);
            
            if (options.script) {
                console.log(script.toString()); 
            } else {
                console.log(network.Address.fromTxOutScript(script).toString());
            }
            
        });

    program.command('send <amount> <pubKeyHash>')
        .description('create a tx sending amount to address (p2pkh)')
        .option('-k --keyname <name>', 'specify which key you want to use for change addresses', 'default')
        .option('-o --outputFile <filename>', 'save to file location.')
        .action (async (amount, pubKeyHash, options, command) => {

            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();
            let toAddress = network.Address.fromString(pubKeyHash);

            let feePerKbNum = network.constants.TxBuilder.feePerKbNum;
            let dust = network.constants.TxBuilder.dust;

            let tx = new bsv.Tx();
            tx.addTxOut(new bsv.Bn(amount), toAddress.toTxOutScript());

            let lastUtxoRowId = 0;
            let valueIn = new bsv.Bn(0);
            let valueOut = new bsv.Bn(amount);
            let unlockScriptWriters = {};
            let scriptSigsTotal = 0;

            while (true) {

                let utxoInfo = wallet.txoutputs.nextUtxo(lastUtxoRowId);
                
                if (utxoInfo === undefined) {
                    throw new Error('not enough utxos')
                }

                lastUtxoRowId = utxoInfo.rowid;

                let utxoId = utxoInfo.txhash.toString('hex') + ':' + utxoInfo.txoutnum.toString();

                let spendTxInfo = wallet.transactions.txByHash(utxoInfo.txhash);
                let spendTx = bsv.Tx.fromBuffer(spendTxInfo.rawtx);
                let spendTxOut = spendTx.txOuts[utxoInfo.txoutnum];

                let scriptHash = bsv.Hash.sha256(spendTxOut.script.toBuffer());
                let scriptInfo = wallet.scripts.getScriptByHash(scriptHash);
                let scriptData = JSON.parse(scriptInfo.data.toString());

                let spendHandler = wallet.getSpendHandler(utxoInfo.type);

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

                while (changeAmount.gt(dust)) {
                    let changeScript = P2PKH.receive(wallet.scripts, wallet.hdkeys, 'default', network);
                    let changeTxOut = bsv.TxOut.fromProperties(new bsv.Bn(0), changeScript);
                    
                    estimatedSize += changeTxOut.toBuffer().length;
                    estimatedFee = new bsv.Bn(Math.ceil(estimatedSize / 1000 * feePerKbNum));

                    if (changeAmount.sub(estimatedFee).gt(3000)) {
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

                if (valueIn.lt(minValueIn)) {
                    // need more inputs to fund tx
                    continue;
                }

                break;
            }

            let hashCache = {};

            tx.txIns.forEach(function (txIn, nIn) {
                let utxoId = txIn.txHashBuf.toString('hex') + ':' + txIn.txOutNum.toString();
                if (unlockScriptWriters[utxoId]) {
                    let script = unlockScriptWriters[utxoId](tx, nIn, hashCache);
                    txIn.setScript(script);
                }
            });

            if (options.outputFile) {
                fs.writeFileSync(options.outputFile, tx.toBuffer());
            } else {
                process.stdout.write(tx.toBuffer());
            }
        });

    program.command('add-mapi <name> <pubkey> <endpoint>')
        .description('add a mapi endpoint')
        .action (async (name, pubkey, endpoint, options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            wallet.mapi.addMiner(name, pubkey, endpoint);
        });

    program.command('show-mapi')
        .description('show mapi endpoints')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);

            let miners = wallet.mapi.allMiners();

            let dataOut = miners.map(function (item) {
                let retObj = { 
                    name: item.name,
                    endpoint: item.endpoint,
                    expires: undefined,
                    standard: undefined,
                    data: undefined
                };

                if (item.feequote && item.feeexpiry > Date.now()) {
                    
                    retObj.expires = ((item.feeexpiry-Date.now())/1000/60).toFixed(0) + ' hrs';

                    let quoteObj = JSON.parse(item.feequote);
                    
                    quoteObj.fees.forEach(function (x) {
                        if (x.feeType === 'standard' || x.feeType === 'data') {
                            retObj[x.feeType] = Math.ceil(x.miningFee.satoshis/(x.miningFee.bytes/1000));
                        }
                    });  
                }

                return retObj;
            });

            console.table(dataOut);
        });

    program.command('get-fee-quote <miner>')
        .description('get fee quote from mapi')
        .option('-o --overwrite', 'let the current fee quote be overwritten if it has not expired.')
        .action (async (minerName, options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let minerInfo = wallet.mapi.getMinerByName(minerName);
            
            if (minerInfo === undefined) {
                console.error('Unknown miner');
                process.exit(1);
            }

            if (minerInfo.feeexpiry > Date.now() && !options.overwrite) {
                console.error('Valid fee quote exists, use -o flag to overwrite.');
                process.exit(1);
            }

            let requestUrl = new URL(minerInfo.endpoint);
            requestUrl.pathname = '/mapi/feeQuote';

            try {
                const response = await axios.get(requestUrl.toString());

                if (response.data) {
                    let hashBuf = bsv.Hash.sha256(Buffer.from(response.data.payload));
                    let sig = bsv.Sig.fromString(response.data.signature);
                    let pubKey = bsv.PubKey.fromString(response.data.publicKey)
                    let sigVerified = bsv.Ecdsa.verify(hashBuf, sig, pubKey, 'big');
                    if (sigVerified) {
                        let payloadObj = JSON.parse(response.data.payload);
                        let expiry = new Date(payloadObj.expiryTime).valueOf();
                        wallet.mapi.setFeeQuote(minerInfo.name, expiry, response.data.payload);
                        console.log(response.data.payload.fees);
                    }
                }
            } catch (error) {
                console.error(error);
            }

        });

    program.command('submit-tx <miner> <txfilename>')
        .description('submit tx via mapi')
        .action (async (minerName, txfilename, options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let minerInfo = wallet.mapi.getMinerIdByName(minerName);
            
            if (minerInfo === undefined) {
                console.error('Unknown miner');
                process.exit(1);
            }

            let txBuf = fs.readFileSync(txfilename);

            let requestUrl = new URL(minerInfo.endpoint);
            requestUrl.pathname = '/mapi/tx';

            try {
                let response = await axios.post(
                    requestUrl.toString() ,
                    { rawtx: txBuf.toString('hex') },
                    { headers: { 'Content-Type': 'application/json' }}
                );
                
                if (response.data) {

                    let hashBuf = bsv.Hash.sha256(Buffer.from(response.data.payload));
                    let sig = bsv.Sig.fromString(response.data.signature);
                    let pubKey = bsv.PubKey.fromString(response.data.publicKey)
                    let sigVerified = bsv.Ecdsa.verify(hashBuf, sig, pubKey, 'big');
                    
                    if (!sigVerified) {
                        console.error('WARNING: Signature verification failed.');
                    }
                    
                    let payload = JSON.parse(response.data.payload);
                    
                    console.log(payload);
                }
            } catch (error) {
                console.error(error);
            }

        });

    return program;
}

module.exports = { initWallet, getWallet, makeProgram }
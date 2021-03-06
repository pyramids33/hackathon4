const commander = require('commander');
const fs = require('fs');
const bsv = require('bsv');
const axios = require('axios').default;

const SyncHeaders = require('./p2pnetwork.js');
const { OpenSqliteFile } = require('./dbutil.js');
const BaseWallet = require('./wallet.js');
const P2PKH = require('./p2pkh.js');
const P2OHPKH = require('./p2ohpkh.js');

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
        .option('-n --network <network>', 'mainnet or testnet', 'mainnet')
        .action (function (options, command) {
            let db;
            let { network } = options;
            try {
                db = initWallet(network, Date.now());
                
                if (fs.existsSync(command.parent.opts().dbfile)){
                    console.error('File already exists.');
                    process.exit(1);
                }

                fs.writeFileSync(command.parent.opts().dbfile, db.serialize(), { flag: 'wx' });
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

    program.command('show-chaintips')
        .description('show the chaintip(s)')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let rows = wallet.headers.getChainTips();

            console.table(rows.map(function (item) {
                return { 
                    height: item.height,
                    blockId: Buffer.from(item.hash).reverse().toString('hex')
                }
            }));
        }); 

    program.command('sync-headers')
        .description('download block headers')
        .option('-r --reset', 'fully reset headers from genesis')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();

            if (options.reset) {
                wallet.headers.fullReset(network);
            }

            let chainTip = wallet.headers.getChainTips()[0];
            console.log('chaintip', chainTip.height, chainTip.hash.toString('hex'));
            
            SyncHeaders(
                network.peers[0], 
                network.constants.Port,
                network.constants.Msg.versionBytesNum, 
                network.constants.Msg.magicNum,
                wallet.headers, 
                function (report) {
                    let chainTip = wallet.headers.getChainTips()[0];
                    console.log('received', report.headerCount, 'headers, processed in', (report.processingTime/1000).toFixed(2), 'seconds');
                    console.log('chaintip', chainTip.height, chainTip.hash.toString('hex'));
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

    program.command('tx')
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

    program.command('download-tx <txid>')
        .description('download tx from whats on chain')
        .action (async (txid, options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();
            
            let networkName = network.name === 'mainnet' ? 'main' : 'test';
            let url = `https://api.whatsonchain.com/v1/bsv/${networkName}/tx/${txid}/hex`;
            
            try {
                let response = await axios.get(url);
                process.stdout.write(Buffer.from(response.data,'hex'));
            } catch(error) {
                console.error(error.message);
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

            let tx = new bsv.Tx();
            tx.addTxOut(new bsv.Bn(amount), toAddress.toTxOutScript());

            tx = wallet.fundTransaction(tx, options.keyname);

            if (options.outputFile) {
                fs.writeFileSync(options.outputFile, tx.toBuffer());
            } else {
                process.stdout.write(tx.toBuffer());
            }
        });

    program.command('spend-all <pubKeyHash>')
        .description('create a tx sending all spendable to address (p2pkh)')
        .option('-o --outputFile <filename>', 'save to file location.')
        .action (async (pubKeyHash, options, command) => {

            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();
            let toAddress = network.Address.fromString(pubKeyHash);

            let tx = new bsv.Tx();
            tx.addTxOut(bsv.TxOut.fromProperties(new bsv.Bn(0), toAddress.toTxOutScript()));

            tx = wallet.fundTransaction(tx, undefined, undefined, true, 0);

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
        .option('-n --name <name>', 'show by name')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);

            if (options.name) {

                let miner = wallet.mapi.getMinerByName(options.name);
                console.log(miner);

            } else {

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
            }
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
                    let pubKey = bsv.PubKey.fromString(minerInfo.pubkey);
                    let sigVerified = bsv.Ecdsa.verify(hashBuf, sig, pubKey, 'big');
                    
                    if (!sigVerified) {
                        console.error('WARNING: Signature verification failed.');
                    }

                    let payloadObj = JSON.parse(response.data.payload);
                    let expiry = new Date(payloadObj.expiryTime).valueOf();
                    wallet.mapi.setFeeQuote(minerInfo.name, expiry, response.data.payload);
                    
                    console.log(payloadObj.fees);
                }
            } catch (error) {
                console.error(error);
            }

        });

    program.command('set-mapi-spvchannel <url> <token>')
        .description('set callback url for merkle proofs')
        .action (async (url, token, options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            wallet.walletMeta.setJSON('mapi-spvchannel', { url, token });
        });

    program.command('show-mapi-spvchannel')
        .description('show callback url for merkle proofs')
        .action (async (options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            console.log(wallet.walletMeta.getJSON('mapi-spvchannel'));
        });

    program.command('set-mapi-spvtoken <name> <token>')
        .description('set miners token to use when sending merkle proof callbacks')
        .action (async (name, token, options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            wallet.mapi.setCallbackToken(name, token);
        });

    program.command('check-mapi-spvchannel')
        .description('check spv channel for merkle proof')
        .action (async (options, command) => {

            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let channelInfo = wallet.walletMeta.getJSON('mapi-spvchannel');

            if (channelInfo === undefined) {
                console.error('Channel not defined');
                process.exit(1);
            }

            //console.log(channelInfo);

            try {
                let response = await axios.get(channelInfo.url, { headers: { 'Authorization': 'Bearer ' + channelInfo.token }})         
                console.log(response.data);         
            } catch (error) {
                if (error.response) {
                    console.log(error.response.status);
                } else {
                    console.log(error.message);
                }
            }
        });

    program.command('submit-tx <miner> <txfilename>')
        .description('submit tx via mapi')
        .action (async (minerName, txfilename, options, command) => {
            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let minerInfo = wallet.mapi.getMinerByName(minerName);
            
            if (minerInfo === undefined) {
                console.error('Unknown miner');
                process.exit(1);
            }

            let txBuf = fs.readFileSync(txfilename);

            let requestUrl = new URL(minerInfo.endpoint);
            requestUrl.pathname = '/mapi/tx';

            let requestParams = { 
                rawtx: txBuf.toString('hex')
            };

            let channelInfo = JSON.parse(wallet.walletMeta.getString('mapi-spvchannel'));

            if (channelInfo && minerInfo.callbacktoken) {
                requestParams.callbackUrl = channelInfo.url;
                requestParams.callbackToken = 'Authorization: Bearer ' + minerInfo.callbacktoken;
                requestParams.merkleProof = true;
                requestParams.merkleFormat = 'TSC';
            }

            try {
                let response = await axios.post(
                    requestUrl.toString(),
                    requestParams,
                    { headers: { 'Content-Type': 'application/json' }}
                );
                
                if (response.data) {

                    let hashBuf = bsv.Hash.sha256(Buffer.from(response.data.payload));
                    let sig = bsv.Sig.fromString(response.data.signature);
                    let pubKey = bsv.PubKey.fromString(minerInfo.pubkey);
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


    program.command('set-vendor-key <privkey>')
        .description('set the vendor private key for receiving orders')
        .action (async (privkey, options, command) => {

            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();

            let pkcheck = network.PrivKey.fromString(privkey);
            wallet.walletMeta.setValue('vendorPrivKey', pkcheck.toString());
        });

    program.command('show-vendor-key')
        .description('set the vendor private key for receiving orders')
        .action (async (options, command) => {

            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();

            let vendorKeyStr = wallet.walletMeta.getString('vendorPrivKey');

            if (vendorKeyStr) {
                let privKey = network.PrivKey.fromString(vendorKeyStr);
                let pubKey = bsv.PubKey.fromPrivKey(privKey);
                
                console.log(privKey.toString());
                console.log(pubKey.toString());
            } else {
                console.log('Vendor key not defined.');
            }
        });

    program.command('order-start <orderfile>')
        .description('create a tx paying the order in orderfile')
        .option('-o --outputFile <filename>', 'save to file location.')
        .action (async (orderfile, options, command) => {

            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();

            let orderjson = JSON.parse(fs.readFileSync(orderfile).toString());
            let order = P2OHPKH.Order.fromJSON(orderjson);

            let orderScript = P2OHPKH.startOrder(order, wallet.scripts, wallet.hdkeys, 'default', network);
            
            let tx = new bsv.Tx();
            tx.addTxOut(new bsv.Bn(order.total()), orderScript);
            tx = wallet.fundTransaction(tx, 'default', undefined, true);

            if (options.outputFile) {
                fs.writeFileSync(options.outputFile, tx.toBuffer());
            } else {
                process.stdout.write(tx.toBuffer());
            }
        });

    program.command('order-accept <orderfile> <ordertxfile>')
        .description('creates a tx spending the order script with vendor key')
        .option('-o --outputFile <filename>', 'save to file location.')
        .action (async (orderfile, ordertxfile, options, command) => {

            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();

            let privKeyString = wallet.walletMeta.getString('vendorPrivKey');
            
            if (privKeyString === undefined) {
                console.error('vendorPrivKey not defined');
                process.exit(1);
            }

            let vendorPrivKey = network.PrivKey.fromString(privKeyString);

            let orderjson = JSON.parse(fs.readFileSync(orderfile).toString());
            let orderTxBuf = fs.readFileSync(ordertxfile);
            let orderTx = bsv.Tx.fromBuffer(orderTxBuf);
            let order = P2OHPKH.Order.fromJSON(orderjson);

            let changeScript = P2PKH.receive(wallet.scripts, wallet.hdkeys, 'default', network);

            let tx = P2OHPKH.spendOrder(order, orderTx, vendorPrivKey, undefined, changeScript, network);

            if (options.outputFile) {
                fs.writeFileSync(options.outputFile, tx.toBuffer());
            } else {
                process.stdout.write(tx.toBuffer());
            }
        });

    program.command('order-cancel <orderfile> <ordertxfile>')
        .description('creates a tx spending the order script with refund key')
        .option('-o --outputFile <filename>', 'save to file location.')
        .action (async (orderfile, ordertxfile, options, command) => {

            let db = OpenSqliteFile(command.parent.opts().dbfile);
            let wallet = getWallet(db);
            let network = wallet.getNetwork();

            let orderjson = JSON.parse(fs.readFileSync(orderfile).toString());
            let orderTxBuf = fs.readFileSync(ordertxfile);
            let orderTx = bsv.Tx.fromBuffer(orderTxBuf);
            let order = P2OHPKH.Order.fromJSON(orderjson);

            let orderHash2 = bsv.Hash.sha256Sha256(order.toBuffer());

            let orderTxOut = orderTx.txOuts.find(function (txOut) {
                return txOut.script.chunks[6].buf.compare(bsv.Hash.sha256Ripemd160(order.getOrderPubKey().toBuffer())) === 0
                    && txOut.script.chunks[1].buf.compare(orderHash2) === 0
            });

            let scriptHash = bsv.Hash.sha256(orderTxOut.script.toBuffer());
            let scriptInfo = wallet.scripts.getScriptByHash(scriptHash);
            let scriptData = JSON.parse(scriptInfo.data.toString());

            let hdkeyInfo = wallet.hdkeys.getHDKey(scriptData.hdkey);
            let refundPrivKey = network.Bip32.fromBuffer(hdkeyInfo.xprv).deriveChild(scriptData.counter,true).privKey;

            let changeScript = P2PKH.receive(wallet.scripts, wallet.hdkeys, 'default', network);

            let tx = P2OHPKH.spendOrder(order, orderTx, undefined, refundPrivKey, changeScript, network);

            if (options.outputFile) {
                fs.writeFileSync(options.outputFile, tx.toBuffer());
            } else {
                process.stdout.write(tx.toBuffer());
            }
        });


    return program;
}

module.exports = { initWallet, getWallet, makeProgram }
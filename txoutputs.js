
function updateSchema (db) {
    db.prepare(`
        create table if not exists txoutputs (
            txhash blob, txoutnum integer, amount integer, type text, status int, spenttxhash blob, spenttxoutnum integer)`
    ).run();

    db.prepare('create unique index if not exists txoutputs_txhash_txoutnum on txoutputs(txhash, txoutnum)').run();
    db.prepare('create index if not exists txoutputs_status on txoutputs(status)').run();
}



TXO_STATUS = {
    SPENT: 0,
    SPENDABLE: 1,
    RESERVED: 2,
    UNSPENDABLE: 3
};

function TxOutputsDb (db) {

    /*
    status
    0 = spent
    1 = spendable
    2 = reserved
    3 = notspendable

    Reserved will be used when you send funds to an output that will be used in some 
    other process, like a sequence of transactions. That process will have some other 
    db table or information, it knows which utxos it has reserved so it will spend them 
    or update the status when necessary. For these, there should be an entry in scripts
    table with the complete data necessary to spend.

    Unspendable utxos are formed in a process when you don't immediately have the spending information
    in scripts table and cannot create a valid unlocking script. For instance, someone has sent you an 
    output that requires an expensive calculation to spend. The process that
    creates the utxo should at some point fill in the script table with the data needed and 
    set the status of the utxo.

    When the wallet processes a transaction, any known utxos which are spent have the 
    status updated to spent.

    */

    db.prepare(`
        create temp view if not exists txoutputs_unspent (txhash, txoutnum, amount, type) as 
        select txhash,txoutnum,amount,type from txoutputs where status = 1`
    ).run();

    const psAddTxOutput = db.prepare('insert into txoutputs (txhash, txoutnum, amount, type, status) values (?,?,?,?,?)');

    function addTxOutput (txhash, txoutnum, amount, type, status) {
        return psAddTxOutput.run(txhash, txoutnum, amount, type, status);
    }

    const psSpendTxOutput = db.prepare('update txoutputs set status = 0, spenttxhash = ?, spenttxoutnum = ? where txhash = ? and txoutnum = ?');
    
    function spendTxOutput (txhash, txoutnum, spenttxhash, spenttxinnum) {
        return psSpendTxOutput.run(spenttxhash, spenttxinnum, txhash, txoutnum);
    }

    const psGetTxOutput = db.prepare('select * from txoutputs where txhash = ? and txoutnum = ?');

    function getTxOutput(txhash, txoutnum) {
        return psGetTxOutput.get(txhash, txoutnum);
    }

    const psNextUtxo = db.prepare('select rowid,* from txoutputs where rowid > ? and status = 1 order by rowid limit 1');

    function nextUtxo (previousRowId) {
        return psNextUtxo.get(previousRowId);
    }

    const psTxOutputsByStatus = db.prepare('select * from txoutputs where status = ?');

    function txOutputsByStatus (status) {
        return psTxOutputsByStatus.all(status);
    }

    return {
        ps: { psAddTxOutput, psSpendTxOutput, psGetTxOutput, psNextUtxo },
        addTxOutput,
        spendTxOutput,
        getTxOutput,
        nextUtxo,
        txOutputsByStatus
    }

}

module.exports = {
    updateSchema,
    api: TxOutputsDb,
    TXO_STATUS
}
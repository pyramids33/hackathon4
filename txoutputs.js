
function updateSchema (db) {
    db.prepare(`
        create table if not exists txoutputs (
            txhash blob, txoutnum integer, amount integer, type text, status int, spenttxhash blob, spenttxoutnum integer)`
    ).run();

    db.prepare('create unique index if not exists txoutputs_txhash_txoutnum on txoutputs(txhash, txoutnum)').run();
    db.prepare('create index if not exists txoutputs_status on txoutputs(status)').run();
}

function TxOutputsDb (db) {

    /*
    status
    0 = spent
    1 = spendable
    2 = reserved
    3 = notspendable
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

    const psNextUtxo = db.prepare('select rowid,* from txoutputs where rowid > ? and status = 0 order by rowid limit 1');

    function nextUtxo (previousRowId) {
        return psNextUtxo.get(previousRowId);
    }

    return {
        ps: { psAddTxOutput, psSpendTxOutput, psGetTxOutput, psNextUtxo },
        addTxOutput,
        spendTxOutput,
        getTxOutput,
        nextUtxo
    }

}

module.exports = {
    updateSchema,
    api: TxOutputsDb
}
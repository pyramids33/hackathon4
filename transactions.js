
function TransactionsDb (db) {

    const psAddTransaction = db.prepare(`insert into transactions (txhash, status, rawtx) values (?,?,?)`);

    function addTransaction  (txhash,status,buf) {
        return psAddTransaction.run(txhash,status,buf);
    }

    const psTxByTxHash = db.prepare('select * from transactions where txhash = ?');

    function txByHash  (txhash) {
        return psTxByTxHash.get(txhash);
    }

    const psSetStatus = db.prepare('update transactions set status = ? where txhash = ?');
    
    function setStatus (txhash, status) {
        return psSetStatus.run(status, txhash);
    }

    return {
        ps: { psAddTransaction, psTxByTxHash, psSetStatus },
        addTransaction,
        txByHash,
        setStatus
    }
}

function updateSchema(db) {
    db.prepare('create table if not exists transactions (txhash blob, status text, rawtx blob)').run();
    db.prepare('create unique index if not exists transactions_txhash on transactions(txhash)').run();
    db.prepare('create index if not exists transactions_status on transactions(status)').run();
}


module.exports = {
    updateSchema,
    api: TransactionsDb
}
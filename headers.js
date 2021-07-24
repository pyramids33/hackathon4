const { Transactor } = require("./dbutil");

function blockHeaderFromDbRow(row) {
    return new bsv.BlockHeader(
        row.version, 
        Buffer.from(row.prevblock),
        Buffer.from(row.merkleroot),
        row.time, 
        row.bits, 
        row.nonce);
}

function HeadersDb (db) {

    const psAddHeader = db.prepare(`insert into headers (hash, height, version, prevblock, merkleroot, time, bits, nonce) values (?,?,?,?,?,?,?,?)`);
    
    function addHeader (hash, height, version, prevblock, merkleroot, time, bits, nonce) {
        psAddHeader.run(hash, height, version, prevblock, merkleroot, time, bits, nonce);
    }
    
    const psGetByHash = db.prepare('select * from headers where hash = ?');

    function getByHash (hash) {
        return psGetByHash.get(hash);
    }

    const psGetByHeight = db.prepare('select * from headers where height = ?');

    function getByHeight(height) {
        return psGetByHeight.all(height);
    }

    const psGetChainTips = db.prepare('select * from headers where height = (select max(height) from headers)');

    function getChainTips () {
        return psGetChainTips.all();
    }

    const psDeleteAll = db.prepare('delete from headers');

    function fullReset (network) {
        psDeleteAll.run();    
        addHeader(
            Buffer.from(network.genesisBlock.hash,'hex'), 0, 1, null, 
            Buffer.from(network.genesisBlock.merkleRoot,'hex'), 
            network.genesisBlock.time, 
            network.genesisBlock.bits, 
            network.genesisBlock.nonce);
    }

    function resolveOrphans (height, rows) {
        // we have more than one header row at this height.
        // check the next few blocks to eliminate the orphaned chains
        // return the row at height that is linked by prevblock
        // should rarely be more than 1-2 iterations in practice
        let nextRows = getByHeight(height + 1);
        let nextRow = nextRows.length > 1 ? resolveOrphans(height + 1, nextRows) : nextRows[0];
        return nextRow ? rows.find((item) => item.hash === nextRow.prevblock) : undefined;
    }

    function getBlockLocatorRows (chainTip) {

        let blockLocatorRows = [chainTip];
        let height = chainTip.height - 1;
        let step = 1;

        if (height < 0) return blockLocatorRows;
        
        while (height > 0) {
            let rows = getByHeight(height);
            
            if (rows === undefined || rows.length === 0) {
                // reached the start of chain
                break;
            }
        
            let row = rows.length > 1 ? resolveOrphans(height, rows) : rows[0];
        
            if (row === undefined) {
                // should not happen
                break;
            }

            blockLocatorRows.push(row);
        
            if (blockLocatorRows.length >= 10) {
                step *= 2;
            }
        
            height -= step;
        }

        blockLocatorRows.push(getByHeight(0)[0]);

        return blockLocatorRows;
    }

    return {
        ps: { psAddHeader, psGetByHash, psGetByHeight, psGetChainTips },
        addHeader,
        getByHash,
        getChainTips,
        getByHeight,
        resolveOrphans,
        getBlockLocatorRows,
        fullReset,
        transaction: Transactor(db)
    }
}

function updateSchema (db) {
    db.prepare('create table if not exists headers (hash blob, height int, version int, prevblock blob, merkleroot blob, time int, bits int, nonce int)').run();
    db.prepare('create unique index if not exists headers_hash on headers(hash)').run();
    db.prepare('create index if not exists headers_height on headers(height)').run();
}



module.exports = {
    updateSchema,
    api: HeadersDb,
}
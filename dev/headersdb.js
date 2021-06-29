const sqlite3 = require('better-sqlite3');

function HeadersDb (filename) {

    let db = new sqlite3(filename);
    db.pragma('journal_mode = WAL');
    process.on('exit', function () { db.close(); });

    function transaction (fn) {
        return db.transaction(fn)();
    }

    db.prepare('create table if not exists headers (hash text, height int, version int, prevblock text, merkleroot text, time int, bits int, nonce int)').run();
    db.prepare('create unique index if not exists headers_hash on headers(hash)').run();
    db.prepare('create index if not exists headers_height on headers(height)').run();

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

    function resolveOrphans (height, rows) {
        // we have more than one header row at this height.
        // check the next few blocks to eliminate the orphaned chains
        // return the row at current height that is linked by prevblock
        // should rarely be more than 1-2 iterations in practice
        let nextRows = getByHeight(height + 1);
        let nextRow = nextRows.length > 1 ? resolveOrphans(db, height + 1, nextRows) : nextRows[0];
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
        db,
        transaction,
        addHeader,
        getByHash,
        getChainTips,
        getByHeight,
        resolveOrphans,
        getBlockLocatorRows
    }
}

module.exports = HeadersDb
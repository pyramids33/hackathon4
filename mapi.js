

function updateSchema (db) {
    db.prepare('create table if not exists mapi_minerid (name text primary key, pubkey blob, endpoint text)').run();
    db.prepare('create table if not exists mapi_feequote (miner text, expiry int, payload text)').run();
}

function MapiDb (db) {

    const psAddMinerId = db.prepare('insert into mapi_minerid (name,pubkey,endpoint) values (?,?,?)');
    
    function addMinerId (name, pubkey, endpoint) {
        return psAddMinerId.run(name, pubkey, endpoint);
    }

    const psGetMinerIdByName = db.prepare('select * from mapi_minerid where name = ?');
    
    function getMinerIdByName (name) {
        return psGetMinerIdByName.get(name);
    }

    const psAllMinerIds = db.prepare('select * from mapi_minerid order by name');

    function allMinerIds () {
        return psAllMinerIds.all();
    }

    const psAddFeeQuote = db.prepare('insert into mapi_feequote (miner,expiry,payload) values (?,?,?)');
    
    function addFeeQuote (miner, expiry, payload) {
        return psAddFeeQuote.run(miner, expiry, payload);
    }
    
    return {
        ps: { psAddMinerId, psAddFeeQuote },
        updateSchema,
        addMinerId,
        getMinerIdByName,
        allMinerIds,
        addFeeQuote
    }
}

module.exports = {
    updateSchema,
    api: MapiDb
}

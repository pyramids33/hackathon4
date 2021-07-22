

function updateSchema (db) {
    db.prepare('create table if not exists mapi_miners (name text primary key, pubkey blob, endpoint text, feeexpiry int, feequote text)').run();
}

function MapiDb (db) {

    const psAddMiner = db.prepare('insert into mapi_miners (name,pubkey,endpoint) values (?,?,?)');
    
    function addMiner (name, pubkey, endpoint) {
        return psAddMiner.run(name, pubkey, endpoint);
    }

    const psGetMinerByName = db.prepare('select * from mapi_miners where name = ?');
    
    function getMinerByName (name) {
        return psGetMinerByName.get(name);
    }

    const psAllMiners = db.prepare('select * from mapi_miners order by name');

    function allMiners () {
        return psAllMiners.all();
    }

    const psSetFeeQuote = db.prepare('update mapi_miners set feeexpiry = ?, feequote = ? where name = ?');

    function setFeeQuote (name, expiry, payload) {
        return psSetFeeQuote.run(expiry, payload, name);
    }

    const psValidFeeQuotes = db.prepare('select * from mapi_miners where feeexpiry > ?');
    
    function validFeeQuotes (currentTime) {
        return psValidFeeQuotes.all(currentTime);
    }
    
    return {
        ps: { psAddMiner, psGetMinerByName, psAllMiners, psSetFeeQuote, psValidFeeQuotes },
        addMiner,
        getMinerByName,
        allMiners,
        setFeeQuote,
        validFeeQuotes
    }
}

module.exports = {
    updateSchema,
    api: MapiDb
}

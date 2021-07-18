
function updateSchema (db) {
    db.prepare('create table if not exists scripts (hash blob, type text, initialstatus int, data blob)').run();
    db.prepare('create unique index if not exists scripts_hash on scripts(hash)').run();
}

// 
// This table stores script information
// A script hash being in this table indicates that we have the necessary data to spend it
// When a known script appears in a tx output, it is added to the txoutputs table with the initial status
// When an output is to be spent, the data blob is used to construct the spending (unlocking) script
//
function ScriptsDb (db) {

    const psAddScript = db.prepare('insert into scripts (hash, type, initialstatus, data) values (?,?,?,?)');

    function addScript (hash, type, initialstatus, data) {
        return psAddScript.run(hash, type, initialstatus, data);
    }   

    const psScriptByHash = db.prepare('select * from scripts where hash = ?');

    function getScriptByHash (hash) {
        return psScriptByHash.get(hash);
    }
    
    const psAllScripts = db.prepare('select * from scripts');

    function getAllScripts () {
        return psAllScripts.all();
    }

    return {
        ps: { psAddScript, psScriptByHash },
        addScript,
        getScriptByHash,
        getAllScripts
    }
}





module.exports = {
    updateSchema,
    api: ScriptsDb
}
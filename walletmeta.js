
function updateSchema (db) {
    db.prepare('create table if not exists _walletmeta (id text primary key, value blob)').run();
}

function WalletMetaDb (db) {

    const psAddMetaData = db.prepare('insert into _walletmeta (id,value) values (?,?) ');
    const psGetValueById = db.prepare('select value from _walletmeta where id = ? ');

    function setValue (id, value) {
        return psAddMetaData.run(id, value);
    }

    function getValue (id) {
        return psGetValueById.pluck().get(id);
    }

    function getString (id) {
        let v = getValue(id);
        return v === undefined ? undefined : v.toString();
    }

    return {
        setValue, getValue, getString
    }
}

module.exports = {
    updateSchema,
    api: WalletMetaDb
}